import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import chokidar from "chokidar";
import { exec } from "child_process";

const app = express();
const port = 3123;

const schemaDir = join(process.cwd(), "schema");
const tablesDir = join(schemaDir, "tables");
const svgDir = join(schemaDir, "dist");
const outputDbml = join(schemaDir, "schema.dbml");
const outputSvg = join(schemaDir, "schema.svg");

const liveReloadServer = livereload.createServer();
liveReloadServer.watch(schemaDir);

app.use(connectLivereload());
app.use(express.static(schemaDir));

app.get("/", (req, res) => {
  res.sendFile(join(schemaDir, "index.html"));
});

app.get("/api/relations", (req, res) => {
  const allFiles = getAllDbmlFiles(tablesDir);
  const relations = allFiles
    .filter((file) => file.type === "relation")
    .map((file) => {
      const name = file.relativePath.split("/").pop().replace(".dbml", "");
      return {
        name,
        type: "relation",
        path: file.relativePath,
        svgPath: `/dist/${name}.svg`,
      };
    });

  const entities = allFiles
    .filter((file) => file.type === "table")
    .map((file) => {
      const name = file.relativePath.split("/").pop().replace(".dbml", "");
      return {
        name,
        type: "entity",
        path: file.relativePath,
        svgPath: `/dist/${name}.svg`,
      };
    });

  res.json([...entities, ...relations]);
});

function getAllDbmlFiles(dir, basePath = tablesDir) {
  let files = [];
  if (!existsSync(dir)) return files;

  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files = files.concat(getAllDbmlFiles(fullPath, basePath));
    } else if (item.endsWith(".dbml")) {
      const relativePath = fullPath.replace(basePath, "").replace(/\\/g, "/");
      const type = relativePath.includes("/relation/") ? "relation" : "table";
      files.push({ path: fullPath, type, relativePath });
    }
  }

  return files;
}

function extractTableReferences(dbmlContent) {
  const references = new Set();

  const refMatches = dbmlContent.match(/ref:\s*[<>\-]\s*(\w+)\./g);
  if (refMatches) {
    refMatches.forEach((match) => {
      const tableName = match.replace(/ref:\s*[<>\-]\s*/, "").replace(".", "");
      references.add(tableName);
    });
  }

  const standaloneRefMatches = dbmlContent.match(
    /Ref:\s*(\w+)\.\w+\s*[<>\-]\s*(\w+)\./g
  );
  if (standaloneRefMatches) {
    standaloneRefMatches.forEach((match) => {
      const tables = match.match(/(\w+)\./g);
      if (tables) {
        tables.forEach((table) => {
          references.add(table.replace(".", ""));
        });
      }
    });
  }

  return Array.from(references);
}

function build() {
  console.log("🔧 Starting build process...");

  if (!existsSync(svgDir)) {
    mkdirSync(svgDir, { recursive: true });
    console.log(`📁 Created output directory: ${svgDir}`);
  }

  const allFiles = getAllDbmlFiles(tablesDir);
  const tableFiles = allFiles.filter((file) => file.type === "table");
  const relationFiles = allFiles.filter((file) => file.type === "relation");

  console.log(
    `📄 Found ${tableFiles.length} tables and ${relationFiles.length} relations`
  );

  const combined = allFiles
    .map(({ path, type, relativePath }) => {
      const content = readFileSync(path, "utf-8");
      return `// === ${type.toUpperCase()}: ${relativePath} ===\n${content}`;
    })
    .join("\n\n");

  writeFileSync(outputDbml, combined);
  console.log(`✅ Combined schema written to ${outputDbml}`);

  exec(`npx dbml-renderer -i ${outputDbml} -o ${outputSvg}`, (err) => {
    if (err) {
      console.error("❌ Error generating main schema.svg:", err);
    } else {
      console.log(`✅ schema.svg generated at ${outputSvg}`);
      liveReloadServer.refresh("/schema.svg");
    }
  });

  relationFiles.forEach(({ path, relativePath }) => {
    const name = relativePath.split("/").pop().replace(".dbml", "");
    const relationContent = readFileSync(path, "utf-8");
    const relationDbmlPath = join(svgDir, `${name}.dbml`);
    const relationSvgPath = join(svgDir, `${name}.svg`);

    const referencedTables = extractTableReferences(relationContent);
    let completeContent = relationContent;

    referencedTables.forEach((tableName) => {
      const tableFile = tableFiles.find(({ path }) => {
        const content = readFileSync(path, "utf-8");
        return (
          content.includes(`Table ${tableName} {`) ||
          content.includes(`Table ${tableName}{`)
        );
      });

      if (tableFile) {
        const tableContent = readFileSync(tableFile.path, "utf-8");
        completeContent = `// === TABLE DEPENDENCY: ${tableName} ===\n${tableContent}\n\n${completeContent}`;
      }
    });

    writeFileSync(relationDbmlPath, completeContent);
    console.log(`🔗 Generating relation diagram: ${name}`);
    exec(
      `npx dbml-renderer -i ${relationDbmlPath} -o ${relationSvgPath}`,
      (err) => {
        if (err) {
          console.error(`❌ Failed to generate ${name}.svg:`, err);
        } else {
          console.log(`✅ ${name}.svg generated`);
        }
      }
    );
  });

  const entityNames = tableFiles
    .map(({ path }) => {
      const content = readFileSync(path, "utf-8");
      const match = content.match(/Table\s+(\w+)/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  entityNames.forEach((entityName) => {
    const entityFile = tableFiles.find(({ path }) => {
      const fileName = path.split("/").pop()?.replace(".dbml", "");
      return fileName === entityName;
    });

    if (!entityFile) return;

    const entityContent = readFileSync(entityFile.path, "utf-8");
    let completeContent = `// === ENTITY: ${entityName} ===\n${entityContent}`;

    // Referensi langsung dari entity ke table lain
    const referencedTables = [
      ...new Set(
        [...entityContent.matchAll(/ref:\s*[<>-]\s*(\w+)\.\w+/g)].map(
          (match) => match[1]
        )
      ),
    ];

    referencedTables.forEach((tableName) => {
      if (tableName === entityName) return;

      const refTableFile = tableFiles.find(({ path }) => {
        const fileName = path.split("/").pop()?.replace(".dbml", "");
        return fileName === tableName;
      });

      if (refTableFile) {
        const refTableContent = readFileSync(refTableFile.path, "utf-8");
        completeContent = `// === TABLE DEPENDENCY: ${tableName} ===\n${refTableContent}\n\n${completeContent}`;
      } else {
        console.warn(
          `⚠️ Referenced table "${tableName}" not found for "${entityName}"`
        );
      }
    });

    // Tambahkan relasi dari folder /relation
    relationFiles.forEach(({ path, relativePath }) => {
      const relationContent = readFileSync(path, "utf-8");

      const tableNameMatch = relationContent.match(/Table\s+(\w+)/);
      if (!tableNameMatch) return;
      const relationTableName = tableNameMatch[1];

      const fieldLines = relationContent.split("\n").filter((line) => {
        return new RegExp(`ref:\\s*[<>\\-]\\s*${entityName}\\.id`).test(line);
      });

      if (fieldLines.length === 0) return;

      const filteredRelation = `Table ${relationTableName} {\n${fieldLines.join(
        "\n"
      )}\n}`;
      completeContent += `\n\n// === RELATION: ${relativePath} ===\n${filteredRelation}`;
    });

    const entityDbmlPath = join(svgDir, `${entityName}.dbml`);
    const entitySvgPath = join(svgDir, `${entityName}.svg`);
    writeFileSync(entityDbmlPath, completeContent + "\n");
    console.log(`📦 Generating entity diagram: ${entityName}`);
    exec(
      `npx dbml-renderer -i ${entityDbmlPath} -o ${entitySvgPath}`,
      (err) => {
        if (err) {
          console.error(`❌ Failed to generate ${entityName}.svg:`, err);
        } else {
          console.log(`✅ ${entityName}.svg generated`);
        }
      }
    );
  });
}

app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
  build();
});

chokidar.watch(tablesDir, { ignored: /node_modules/ }).on("change", () => {
  console.log("🔁 Change detected. Rebuilding...");
  build();
});
