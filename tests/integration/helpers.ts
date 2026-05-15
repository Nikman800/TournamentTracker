import express from "express";
import { MemStorage, setStorage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";

/**
 * Creates a fresh Express app with a fresh MemStorage instance for each test.
 * Calls setStorage() before registering routes so all route handlers use the fresh instance.
 */
export function createTestApp() {
  const freshStorage = new MemStorage();
  setStorage(freshStorage);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const server = registerRoutes(app);

  return { app, storage: freshStorage, server };
}
