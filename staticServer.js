import express from "express";
import { join } from "path";
import { config } from "./src/config.js";
import { createApiRoutes } from "./src/routes/api.js";

const app = express();

app.use(express.static(config.schemaDir));

app.get("/", (req, res) => {
  res.sendFile(join(config.schemaDir, "index.html"));
});

app.use("/api", createApiRoutes(config));

app.listen(config.port, () => {
  console.log(
    `✅ Static server with API running at http://localhost:${config.port}`
  );
});
