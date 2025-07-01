import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import { join } from "path";
import chokidar from "chokidar";

import { config } from "./src/config.js";
import { createApiRoutes } from "./src/routes/api.js";
import { SchemaBuilder } from "./src/services/SchemaBuilder.js";

const app = express();
const schemaBuilder = new SchemaBuilder(config);

// Live reload
const liveReloadServer = livereload.createServer();
liveReloadServer.watch([join(config.schemaDir, "index.html")]);

app.use(connectLivereload());
app.use(express.static(config.schemaDir));
app.get("/", (req, res) => res.sendFile(join(config.schemaDir, "index.html")));
app.use("/api", createApiRoutes(config));

app.listen(config.port, () => {
  console.log(`🛠 Dev server running at http://localhost:${config.port}`);
  schemaBuilder.build();
});

// Watch changes
chokidar
  .watch(config.tablesDir, { ignored: /node_modules/ })
  .on("change", () => {
    console.log("🔁 Rebuilding...");
    schemaBuilder.build();
  });
