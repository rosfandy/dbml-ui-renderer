import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export class FileScanner {
  constructor(config) {
    this.config = config;
  }

  getAllDbmlFiles(
    dir = this.config.tablesDir,
    basePath = this.config.tablesDir
  ) {
    let files = [];
    if (!existsSync(dir)) return files;

    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files = files.concat(this.getAllDbmlFiles(fullPath, basePath));
      } else if (item.endsWith(".dbml")) {
        const relativePath = fullPath.replace(basePath, "").replace(/\\/g, "/");
        const type = this.determineFileType(fullPath, relativePath);

        // Skip enum files untuk entity/relation listing
        if (type !== "enum") {
          files.push({ path: fullPath, type, relativePath });
        }
      }
    }

    return files;
  }

  // Method baru untuk mendapatkan semua file termasuk enum
  getAllDbmlFilesIncludingEnums(
    dir = this.config.tablesDir,
    basePath = this.config.tablesDir
  ) {
    let files = [];
    if (!existsSync(dir)) return files;

    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files = files.concat(
          this.getAllDbmlFilesIncludingEnums(fullPath, basePath)
        );
      } else if (item.endsWith(".dbml")) {
        const relativePath = fullPath.replace(basePath, "").replace(/\\/g, "/");
        const type = this.determineFileType(fullPath, relativePath);
        files.push({ path: fullPath, type, relativePath });
      }
    }

    return files;
  }

  determineFileType(fullPath, relativePath) {
    // Cek berdasarkan folder path terlebih dahulu
    if (relativePath.includes("/relation/")) {
      return "relation";
    }

    // Baca content untuk deteksi lebih akurat
    try {
      const content = readFileSync(fullPath, "utf-8");

      // Deteksi enum
      if (this.isEnumFile(content)) {
        return "enum";
      }

      // Deteksi table
      if (this.isTableFile(content)) {
        return "table";
      }

      // Deteksi standalone refs
      if (this.isStandaloneRefFile(content)) {
        return "relation";
      }

      // Default fallback
      return "table";
    } catch (error) {
      console.warn(`⚠️ Could not read file ${relativePath}: ${error.message}`);
      return "table"; // fallback
    }
  }

  isEnumFile(content) {
    // Check if file only contains enum definitions
    const lines = content
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("//"));
    const hasEnum = /Enum\s+\w+\s*\{/.test(content);
    const hasTable = /Table\s+\w+\s*\{/.test(content);
    const hasRef = /Ref\s*:/.test(content);

    return hasEnum && !hasTable && !hasRef;
  }

  isTableFile(content) {
    return /Table\s+\w+\s*\{/.test(content);
  }

  isStandaloneRefFile(content) {
    const hasStandaloneRef = /^Ref\s*:/m.test(content);
    const hasTable = /Table\s+\w+\s*\{/.test(content);

    return hasStandaloneRef && !hasTable;
  }

  // Method untuk mendapatkan enum files saja
  getEnumFiles() {
    return this.getAllDbmlFilesIncludingEnums().filter(
      (file) => file.type === "enum"
    );
  }

  // Method untuk mendapatkan table files saja (excluding enums)
  getTableFiles() {
    return this.getAllDbmlFiles().filter((file) => file.type === "table");
  }

  // Method untuk mendapatkan relation files saja
  getRelationFiles() {
    return this.getAllDbmlFiles().filter((file) => file.type === "relation");
  }
}
