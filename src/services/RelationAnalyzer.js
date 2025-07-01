import { readFileSync } from "fs";

export class RelationAnalyzer {
  static extractTableReferences(dbmlContent) {
    const references = new Set();

    const refMatches = dbmlContent.match(/ref:\s*[<>\-]\s*(\w+)\./g);
    if (refMatches) {
      refMatches.forEach((match) => {
        const tableName = match
          .replace(/ref:\s*[<>\-]\s*/, "")
          .replace(".", "");
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

  static extractDirectRelations(tableContent, tableName) {
    const directRelations = new Set();

    const refMatches = tableContent.match(
      /\w+\s+\w+\s*\[.*?ref:\s*[<>\-]\s*(\w+)\.\w+.*?\]/g
    );
    if (refMatches) {
      refMatches.forEach((match) => {
        const tableMatch = match.match(/ref:\s*[<>\-]\s*(\w+)\./);
        if (tableMatch) {
          const referencedTable = tableMatch[1];
          directRelations.add(`${tableName}-${referencedTable}`);
        }
      });
    }

    return Array.from(directRelations);
  }

  static isDirectRelation(relationContent, entityName, allTableFiles) {
    const relationTableMatch = relationContent.match(/Table\s+(\w+)/);
    if (!relationTableMatch) return false;

    const relationTableName = relationTableMatch[1];

    const entityFile = allTableFiles.find(({ path }) => {
      const fileName = path.split("/").pop()?.replace(".dbml", "");
      return fileName === entityName;
    });

    if (!entityFile) return false;

    const entityContent = readFileSync(entityFile.path, "utf-8");
    const directRelations = this.extractDirectRelations(
      entityContent,
      entityName
    );

    const hasDirectRelation = directRelations.some(
      (rel) =>
        rel === `${entityName}-${relationTableName}` ||
        rel === `${relationTableName}-${entityName}`
    );

    if (hasDirectRelation) {
      console.log(
        `⚠️ Skipping relation for ${entityName} -> ${relationTableName} (already exists as direct relation)`
      );
      return true;
    }

    return false;
  }
}
