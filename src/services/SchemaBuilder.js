import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { FileScanner } from "./FileScanner.js";
import { RelationAnalyzer } from "./RelationAnalyzer.js";
import { SvgGenerator } from "./SvgGenerator.js";

export class SchemaBuilder {
  constructor(config) {
    this.config = config;
    this.fileScanner = new FileScanner(config);
    this.svgGenerator = new SvgGenerator(config);

    // Cache untuk table mapping dan content
    this.tableMapping = new Map(); // tableName -> filePath
    this.tableContentCache = new Map(); // filePath -> content
  }

  build() {
    console.log("🔧 Starting build process...");

    this.ensureOutputDirectory();
    const { tableFiles, relationFiles, enumFiles } = this.scanFiles();

    // Build table mapping untuk pencarian yang lebih efisien
    this.buildTableMapping(tableFiles);

    // Validasi referensi sebelum build
    const validation = this.validateReferences([
      ...tableFiles,
      ...relationFiles,
    ]);
    if (validation.missingTables.size > 0) {
      console.warn(
        `⚠️ Found ${validation.missingTables.size} missing table references`
      );
      validation.missingTables.forEach((table) =>
        console.warn(`   - ${table}`)
      );
    }

    this.buildMainSchema(tableFiles, relationFiles, enumFiles);
    this.buildRelationDiagrams(relationFiles, tableFiles);
    this.buildEntityDiagrams(tableFiles, relationFiles);
  }

  ensureOutputDirectory() {
    if (!existsSync(this.config.svgDir)) {
      mkdirSync(this.config.svgDir, { recursive: true });
      console.log(`📁 Created output directory: ${this.config.svgDir}`);
    }
  }

  scanFiles() {
    const allFiles = this.fileScanner.getAllDbmlFilesIncludingEnums();
    const tableFiles = allFiles.filter((file) => file.type === "table");
    const relationFiles = allFiles.filter((file) => file.type === "relation");
    const enumFiles = allFiles.filter((file) => file.type === "enum");

    console.log(
      `📄 Found ${tableFiles.length} tables, ${relationFiles.length} relations, and ${enumFiles.length} enums`
    );

    return { tableFiles, relationFiles, enumFiles };
  }

  // Build mapping dari nama tabel ke file path
  buildTableMapping(tableFiles) {
    console.log("🗺️ Building table mapping...");

    tableFiles.forEach(({ path, relativePath }) => {
      const content = this.getFileContent(path);
      this.tableContentCache.set(path, content);

      // Extract all table names dari file ini
      const tableMatches = content.matchAll(/Table\s+(\w+)\s*\{/g);
      for (const match of tableMatches) {
        const tableName = match[1];
        this.tableMapping.set(tableName, path);
        console.log(`   📋 ${tableName} -> ${relativePath}`);
      }
    });

    console.log(`✅ Mapped ${this.tableMapping.size} tables`);
  }

  getFileContent(path) {
    if (this.tableContentCache.has(path)) {
      return this.tableContentCache.get(path);
    }
    const content = readFileSync(path, "utf-8");
    this.tableContentCache.set(path, content);
    return content;
  }

  // Validasi semua referensi
  validateReferences(allFiles) {
    const allTables = new Set();
    const allReferences = new Set();
    const missingTables = new Set();

    // Kumpulkan semua nama tabel
    allFiles.forEach(({ path }) => {
      const content = this.getFileContent(path);
      const matches = content.matchAll(/Table\s+(\w+)/g);
      for (const match of matches) {
        allTables.add(match[1]);
      }
    });

    // Kumpulkan semua referensi dan check keberadaannya
    allFiles.forEach(({ path, relativePath }) => {
      const content = this.getFileContent(path);
      const references = content.matchAll(/ref:\s*[<>-]\s*(\w+)\.\w+/g);

      for (const ref of references) {
        const tableName = ref[1];
        allReferences.add(tableName);

        if (!allTables.has(tableName)) {
          missingTables.add(tableName);
          console.error(
            `❌ Missing table "${tableName}" referenced in ${relativePath}`
          );
        }
      }
    });

    console.log(
      `✅ Validation: ${allTables.size} tables, ${allReferences.size} references, ${missingTables.size} missing`
    );
    return { allTables, allReferences, missingTables };
  }

  buildMainSchema(tableFiles, relationFiles, enumFiles) {
    const allFiles = [...enumFiles, ...tableFiles, ...relationFiles]; // Enums first
    const combined = allFiles
      .map(({ path, type, relativePath }) => {
        const content = this.getFileContent(path);
        return `// === ${type.toUpperCase()}: ${relativePath} ===\n${content}`;
      })
      .join("\n\n");

    writeFileSync(this.config.outputDbml, combined);
    console.log(`✅ Combined schema written to ${this.config.outputDbml}`);

    this.svgGenerator.generateMainSvg();
  }

  buildRelationDiagrams(relationFiles, tableFiles) {
    relationFiles.forEach(({ path, relativePath }) => {
      const name = relativePath.split("/").pop().replace(".dbml", "");
      const relationContent = this.getFileContent(path);
      const relationDbmlPath = join(this.config.svgDir, `${name}.dbml`);
      const relationSvgPath = join(this.config.svgDir, `${name}.svg`);

      // Resolve semua dependencies secara rekursif
      const allDependencies = this.resolveAllDependencies(relationContent);
      let completeContent = relationContent;

      // Add semua dependencies
      allDependencies.forEach((tableName) => {
        const tablePath = this.tableMapping.get(tableName);
        if (tablePath) {
          const tableContent = this.getFileContent(tablePath);
          completeContent = `// === TABLE DEPENDENCY: ${tableName} ===\n${tableContent}\n\n${completeContent}`;
        }
      });

      writeFileSync(relationDbmlPath, completeContent);
      console.log(
        `🔗 Generating relation diagram: ${name} (${allDependencies.length} dependencies)`
      );
      this.svgGenerator.generateSvg(relationDbmlPath, relationSvgPath, name);
    });
  }

  buildEntityDiagrams(tableFiles, relationFiles) {
    const entityNames = this.extractEntityNames(tableFiles);

    entityNames.forEach((entityName) => {
      const entityPath = this.tableMapping.get(entityName);
      if (!entityPath) {
        console.warn(`⚠️ Entity file not found for: ${entityName}`);
        return;
      }

      const entityFile = tableFiles.find((file) => file.path === entityPath);
      const completeContent = this.buildEntityContent(
        entityFile,
        entityName,
        tableFiles,
        relationFiles
      );

      const entityDbmlPath = join(this.config.svgDir, `${entityName}.dbml`);
      const entitySvgPath = join(this.config.svgDir, `${entityName}.svg`);

      writeFileSync(entityDbmlPath, completeContent + "\n");
      console.log(`📦 Generating entity diagram: ${entityName}`);
      this.svgGenerator.generateSvg(entityDbmlPath, entitySvgPath, entityName);
    });
  }

  extractEntityNames(tableFiles) {
    const entityNames = new Set();

    tableFiles.forEach(({ path }) => {
      const content = this.getFileContent(path);
      const matches = content.matchAll(/Table\s+(\w+)/g);
      for (const match of matches) {
        entityNames.add(match[1]);
      }
    });

    return Array.from(entityNames);
  }

  // Resolve semua dependencies secara rekursif
  resolveAllDependencies(content, visited = new Set()) {
    const directReferences = this.extractDirectReferences(content);
    const allDependencies = new Set();

    directReferences.forEach((tableName) => {
      if (visited.has(tableName)) {
        console.warn(`⚠️ Circular reference detected: ${tableName}`);
        return;
      }

      allDependencies.add(tableName);
      visited.add(tableName);

      // Resolve dependencies dari tabel yang direferensikan
      const tablePath = this.tableMapping.get(tableName);
      if (tablePath) {
        const tableContent = this.getFileContent(tablePath);
        const nestedDependencies = this.resolveAllDependencies(
          tableContent,
          new Set(visited)
        );
        nestedDependencies.forEach((dep) => allDependencies.add(dep));
      }

      visited.delete(tableName);
    });

    return Array.from(allDependencies);
  }

  extractDirectReferences(content) {
    const references = new Set();
    const refMatches = content.matchAll(/ref:\s*[<>-]\s*(\w+)\.\w+/g);

    for (const match of refMatches) {
      references.add(match[1]);
    }

    return Array.from(references);
  }

  buildEntityContent(entityFile, entityName, tableFiles, relationFiles) {
    const entityContent = this.getFileContent(entityFile.path);
    let completeContent = `// === ENTITY: ${entityName} ===\n${entityContent}`;

    // Resolve semua dependencies untuk entity ini
    const allDependencies = this.resolveAllDependencies(entityContent);
    console.log(
      `📋 ${entityName} dependencies: [${allDependencies.join(", ")}]`
    );

    // Add semua table dependencies
    allDependencies.forEach((tableName) => {
      if (tableName === entityName) return;

      const tablePath = this.tableMapping.get(tableName);
      if (tablePath) {
        const tableContent = this.getFileContent(tablePath);
        completeContent = `// === TABLE DEPENDENCY: ${tableName} ===\n${tableContent}\n\n${completeContent}`;
      } else {
        console.warn(
          `⚠️ Referenced table "${tableName}" not found for "${entityName}"`
        );
      }
    });

    // Add relations from relation files
    completeContent = this.addRelationReferences(
      entityName,
      relationFiles,
      tableFiles,
      completeContent
    );

    // Add incoming direct relations
    completeContent = this.addIncomingDirectRelations(
      entityName,
      tableFiles,
      completeContent
    );

    return completeContent;
  }

  addRelationReferences(
    entityName,
    relationFiles,
    tableFiles,
    completeContent
  ) {
    relationFiles.forEach(({ path, relativePath }) => {
      const relationContent = this.getFileContent(path);

      const tableNameMatch = relationContent.match(/Table\s+(\w+)/);
      if (!tableNameMatch) return;

      // Skip if this is a direct relation
      if (
        RelationAnalyzer.isDirectRelation(
          relationContent,
          entityName,
          tableFiles
        )
      ) {
        return;
      }

      const fieldLines = relationContent.split("\n").filter((line) => {
        return new RegExp(`ref:\\s*[<>\\-]\\s*${entityName}\\.id`).test(line);
      });

      if (fieldLines.length === 0) return;

      const relationTableName = tableNameMatch[1];
      const filteredRelation = `Table ${relationTableName} {\n${fieldLines.join(
        "\n"
      )}\n}`;
      completeContent += `\n\n// === RELATION: ${relativePath} ===\n${filteredRelation}`;
    });

    return completeContent;
  }

  addIncomingDirectRelations(entityName, tableFiles, completeContent) {
    tableFiles.forEach(({ path, relativePath }) => {
      const tableContent = this.getFileContent(path);
      const tableNameMatch = tableContent.match(/Table\s+(\w+)/);

      if (!tableNameMatch) return;
      const tableName = tableNameMatch[1];

      // Skip self-reference
      if (tableName === entityName) return;

      // Check if this table has direct references to the current entity
      const hasReferenceToEntity = tableContent.match(
        new RegExp(`ref:\\s*[<>\\-]\\s*${entityName}\\.\\w+`, "g")
      );

      if (hasReferenceToEntity) {
        // Extract only the fields that reference the current entity
        const fieldLines = tableContent.split("\n").filter((line) => {
          return new RegExp(`ref:\\s*[<>\\-]\\s*${entityName}\\.\\w+`).test(
            line.trim()
          );
        });

        if (fieldLines.length > 0) {
          const filteredTable = `Table ${tableName} {\n${fieldLines
            .map((line) => "  " + line.trim())
            .join("\n")}\n}`;
          completeContent += `\n\n// === DIRECT RELATION: ${relativePath} ===\n${filteredTable}`;
          console.log(
            `📎 Added direct relation: ${tableName} -> ${entityName}`
          );
        }
      }
    });

    return completeContent;
  }
}
