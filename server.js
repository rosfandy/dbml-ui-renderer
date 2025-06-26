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
const svgDir = join(schemaDir, "svg"); // Folder untuk SVG individual
const outputDbml = join(schemaDir, "schema.dbml");
const outputSvg = join(schemaDir, "schema.svg");

// 🔁 Livereload setup
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(schemaDir);

app.use(connectLivereload());
app.use(express.static(schemaDir));

// Serve index.html di GET /
app.get("/", (req, res) => {
  res.sendFile(join(schemaDir, "index.html"));
});

// API untuk mendapatkan daftar relation diagrams
app.get("/api/relations", (req, res) => {
  const relations = getAllDbmlFiles(tablesDir)
    .filter((file) => file.type === "relation")
    .map((file) => {
      // Extract relation name dari path
      const pathParts = file.relativePath.split("/");
      const relationName = pathParts[pathParts.length - 1].replace(".dbml", "");

      return {
        name: relationName,
        path: file.relativePath,
        svgPath: `/svg/${relationName}.svg`,
      };
    });

  res.json(relations);
});

// 📁 Fungsi untuk membaca file .dbml secara rekursif
function getAllDbmlFiles(dir, basePath = tablesDir) {
  let files = [];

  if (!existsSync(dir)) return files;

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Rekursif untuk subfolder
      files = files.concat(getAllDbmlFiles(fullPath, basePath));
    } else if (item.endsWith(".dbml")) {
      // Tentukan tipe berdasarkan path relatif
      const relativePath = fullPath.replace(basePath, "").replace(/\\/g, "/");
      const type = relativePath.includes("/relation/") ? "relation" : "table";
      files.push({ path: fullPath, type, relativePath });
    }
  }

  return files;
}

// 🔍 Function to extract table references from DBML content
function extractTableReferences(dbmlContent) {
  const references = new Set();

  // Match patterns like: ref: > table_name.column or ref: < table_name.column
  const refMatches = dbmlContent.match(/ref:\s*[<>-]\s*(\w+)\./g);
  if (refMatches) {
    refMatches.forEach((match) => {
      const tableName = match.replace(/ref:\s*[<>-]\s*/, "").replace(".", "");
      references.add(tableName);
    });
  }

  // Match standalone Ref definitions: Ref: table1.col > table2.col
  const standalonRefMatches = dbmlContent.match(
    /Ref:\s*(\w+)\.\w+\s*[<>-]\s*(\w+)\./g
  );
  if (standalonRefMatches) {
    standalonRefMatches.forEach((match) => {
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

// 🔧 Gabungkan DBML modular + render SVG
function build() {
  // Pastikan folder svg ada
  if (!existsSync(svgDir)) {
    mkdirSync(svgDir, { recursive: true });
  }

  // Dapatkan semua file .dbml secara rekursif
  const allFiles = getAllDbmlFiles(tablesDir);

  // Separate table and relation files
  const tableFiles = allFiles.filter((file) => file.type === "table");
  const relationFiles = allFiles.filter((file) => file.type === "relation");

  // DEBUG: Print info
  // console.log("🔍 DEBUG INFO:");
  // console.log("   tablesDir:", tablesDir);
  // console.log("   svgDir:", svgDir);
  // console.log("   tablesDir exists:", existsSync(tablesDir));
  // console.log("   📋 All DBML files found:");

  allFiles.forEach(({ path, type, relativePath }) => {
    // console.log(
    //   `     ${type === "relation" ? "🔗" : "📁"} ${relativePath} (${type})`
    // );
  });

  console.log("   📋 Total files to combine:", allFiles.length);

  const combined = allFiles
    .map(({ path, type, relativePath }) => {
      const content = readFileSync(path, "utf-8");
      console.log(
        `   ✅ Reading ${type}: ${relativePath} (${content.length} chars)`
      );
      return `// === ${type.toUpperCase()}: ${relativePath} ===\n${content}`;
    })
    .join("\n\n");

  writeFileSync(outputDbml, combined);
  console.log(
    `✅ schema.dbml updated (${allFiles.length} files combined, ${combined.length} chars total)`
  );

  // Generate SVG utama
  exec(
    `npx dbml-renderer -i ${outputDbml} -o ${outputSvg}`,
    (err, stdout, stderr) => {
      if (err) {
        console.error("❌ Error rendering main SVG:", stderr);
      } else {
        // console.log("✅ schema.svg generated");
        liveReloadServer.refresh("/schema.svg");
      }
    }
  );

  // Generate SVG individual untuk setiap relation
  relationFiles.forEach(({ path, relativePath }) => {
    // Extract relation name dari path (misal: /relation/squad_member/squad_member.dbml -> squad_member)
    const pathParts = relativePath.split("/");
    const relationName = pathParts[pathParts.length - 1].replace(".dbml", ""); // Ambil nama file tanpa .dbml

    const relationContent = readFileSync(path, "utf-8");
    const relationDbmlPath = join(svgDir, `${relationName}.dbml`);
    const relationSvgPath = join(svgDir, `${relationName}.svg`);

    // console.log(`   🔗 Processing relation: ${relationName}`);
    // console.log(`      Source: ${relativePath}`);
    // console.log(`      DBML output: ${relationDbmlPath}`);
    // console.log(`      SVG output: ${relationSvgPath}`);

    // Extract referenced tables from relation content
    const referencedTables = extractTableReferences(relationContent);
    // console.log(`      Referenced tables: [${referencedTables.join(", ")}]`);

    // Build complete DBML content with dependencies
    let completeContent = relationContent;

    // Add referenced table definitions
    referencedTables.forEach((tableName) => {
      const tableFile = tableFiles.find((file) => {
        const content = readFileSync(file.path, "utf-8");
        return (
          content.includes(`Table ${tableName} {`) ||
          content.includes(`Table ${tableName}{`)
        );
      });

      if (tableFile) {
        const tableContent = readFileSync(tableFile.path, "utf-8");
        console.log(
          `      ✅ Including table: ${tableName} from ${tableFile.relativePath}`
        );
        completeContent = `// === TABLE DEPENDENCY: ${tableName} ===\n${tableContent}\n\n${completeContent}`;
      } else {
        console.log(`      ⚠️  Table not found: ${tableName}`);
      }
    });

    // Tulis file DBML lengkap untuk relation
    writeFileSync(relationDbmlPath, completeContent);

    // Generate SVG untuk relation ini
    exec(
      `npx dbml-renderer -i ${relationDbmlPath} -o ${relationSvgPath}`,
      (err, stdout, stderr) => {
        if (err) {
          console.error(`❌ Error rendering ${relationName} SVG:`, stderr);
        } else {
          console.log(`✅ ${relationName}.svg generated`);
        }
      }
    );
  });
}

// Start server + watch DBML files
app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
  build();
});

// Watch entire tables directory (including subdirectories)
chokidar.watch(tablesDir, { ignored: /node_modules/ }).on("change", () => {
  console.log("🔁 Change detected. Rebuilding...");
  build();
});
