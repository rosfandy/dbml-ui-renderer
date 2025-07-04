import express from "express";
import { FileScanner } from "../services/FileScanner.js";
import { createDbmlRoutes } from "./dbmlRoutes.js";
import { createScrumRoutes } from "./scrumRoutes.js";

export function createApiRoutes(config) {
  const router = express.Router();
  const fileScanner = new FileScanner(config);

  router.use("/", createDbmlRoutes(fileScanner));
  router.use("/", createScrumRoutes(fileScanner));

  return router;
}
