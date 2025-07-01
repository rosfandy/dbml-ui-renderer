import express from "express";
import { join } from "path";
import { config } from "./src/config.js";
import { createApiRoutes } from "./src/routes/api.js";

const app = express();

// Serve static files (index.html, CSS, dsb)
app.use(express.static(config.schemaDir));

// Serve index.html untuk /
app.get("/", (req, res) => {
  res.sendFile(join(config.schemaDir, "index.html"));
});

// API routes tetap aktif
app.use("/api", createApiRoutes(config));

// Start server
app.listen(config.port, () => {
  console.log(
    `✅ Static server with API running at http://localhost:${config.port}`
  );
});
