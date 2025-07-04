import express from "express";

export function createDbmlRoutes(fileScanner) {
  const router = express.Router();

  router.get("/relations", (req, res) => {
    const relationFiles = fileScanner.getRelationFiles();
    const tableFiles = fileScanner.getTableFiles();

    const relations = relationFiles.map((file) => {
      const name = file.relativePath.split("/").pop().replace(".dbml", "");
      return {
        name,
        type: "relation",
        path: file.relativePath,
        svgPath: `/dist/${name}.svg`,
      };
    });

    const entities = tableFiles.map((file) => {
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

  router.get("/enums", (req, res) => {
    const enumFiles = fileScanner.getEnumFiles();

    const enums = enumFiles.map((file) => {
      const name = file.relativePath.split("/").pop().replace(".dbml", "");
      return {
        name,
        type: "enum",
        path: file.relativePath,
      };
    });

    res.json(enums);
  });

  router.get("/all", (req, res) => {
    const allFiles = fileScanner.getAllDbmlFilesIncludingEnums();

    const categorized = {
      tables: [],
      relations: [],
      enums: [],
    };

    allFiles.forEach((file) => {
      const name = file.relativePath.split("/").pop().replace(".dbml", "");
      const item = {
        name,
        type: file.type,
        path: file.relativePath,
        svgPath: file.type !== "enum" ? `/dist/${name}.svg` : undefined,
      };

      if (file.type === "table") categorized.tables.push(item);
      else if (file.type === "relation") categorized.relations.push(item);
      else if (file.type === "enum") categorized.enums.push(item);
    });

    res.json(categorized);
  });

  return router;
}
