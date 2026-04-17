import express from "express";
import cors from "cors";
import { config } from "./config";
import { initDb } from "./db";
import { seedData } from "./seed";
import { bootstrapAdmin } from "./bootstrapAdmin";
import routes from "./cbtRoutes";

async function main(): Promise<void> {
  initDb();
  seedData();
  await bootstrapAdmin();

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/cbt/v1", routes);

  app.listen(config.port, () => {
    console.log(`CBT backend listening on http://localhost:${config.port}`);
    console.log(`API base: http://localhost:${config.port}/api/cbt/v1 (frontend: ${config.appBaseUrl})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
