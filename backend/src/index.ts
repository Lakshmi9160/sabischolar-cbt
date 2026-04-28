import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { initDb } from "./db";
import { seedData } from "./seed";
import { bootstrapAdmin } from "./bootstrapAdmin";
import routes from "./cbtRoutes";

function assertProductionJwt(): void {
  if (config.nodeEnv !== "production") return;
  const weak = new Set(["", "dev_secret_only", "change_me_in_production"]);
  const s = config.jwtSecret;
  if (!s || s.length < 32 || weak.has(s)) {
    console.error(
      "[fatal] In production, set JWT_SECRET to a random string of at least 32 characters (not a dev placeholder)."
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertProductionJwt();
  initDb();
  seedData();
  await bootstrapAdmin();

  const app = express();

  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  if (config.nodeEnv === "production") {
    app.use(
      helmet({
        contentSecurityPolicy: false
      })
    );
  }

  if (config.corsAllowedOrigins.length > 0) {
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin) {
            callback(null, true);
            return;
          }
          if (config.corsAllowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(null, false);
        },
        credentials: true
      })
    );
  } else {
    app.use(cors());
  }

  app.use(express.json());

  app.use("/api/cbt/v1", routes);
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  if (config.frontendDist) {
    const abs = path.resolve(config.frontendDist);
    if (fs.existsSync(abs)) {
      console.log(`[static] Serving SPA from ${abs}`);
      app.use(express.static(abs));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(abs, "index.html"));
      });
    } else {
      console.warn(`[static] FRONTEND_DIST directory not found: ${abs}`);
    }
  }

  app.listen(config.port, () => {
    console.log(`CBT backend listening on http://localhost:${config.port}`);
    console.log(`API base: http://localhost:${config.port}/api/cbt/v1 (frontend: ${config.appBaseUrl})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
