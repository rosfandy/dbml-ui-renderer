import express from "express";

export function createScrumRoutes(fileScanner) {
  const router = express.Router();

  router.get("/scrum", (req, res) => {
    const allFiles = fileScanner.getAllDbmlFilesIncludingEnums();

    const scrumFiles = allFiles.filter((file) =>
      file.relativePath.includes("scrum")
    );

    const result = scrumFiles.map((file) => {
      const name = file.relativePath.split("/").pop().replace(".dbml", "");
      return {
        name,
        type: file.type,
        path: file.relativePath,
        svgPath: file.type !== "enum" ? `/dist/${name}.svg` : undefined,
      };
    });

    res.json(result);
  });

  return router;
}
