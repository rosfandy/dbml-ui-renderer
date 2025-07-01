import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import { join } from "path";
import chokidar from "chokidar";

import { config } from "./src/config.js";
import { createApiRoutes } from "./src/routes/api.js";
import { SchemaBuilder } from "./src/services/SchemaBuilder.js";

const app = express();

// Initialize services
const schemaBuilder = new SchemaBuilder(config);

// Setup live reload
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(config.schemaDir);

// Middleware
app.use(connectLivereload());
app.use(express.static(config.schemaDir));

// Routes
app.get("/", (req, res) => {
  res.sendFile(join(config.schemaDir, "index.html"));
});

app.use("/api", createApiRoutes(config));

// Start server and build
app.listen(config.port, () => {
  console.log(`🌐 Server running at http://localhost:${config.port}`);
  schemaBuilder.build();
});

// Watch for changes
chokidar
  .watch(config.tablesDir, { ignored: /node_modules/ })
  .on("change", () => {
    console.log("🔁 Change detected. Rebuilding...");
    schemaBuilder.build();
  });
