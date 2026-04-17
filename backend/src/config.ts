import dotenv from "dotenv";

dotenv.config();

const allowFlag = process.env.ALLOW_BOOTSTRAP_ADMIN;
const allowBootstrapAdmin =
  allowFlag === "1" || allowFlag === "true" || allowFlag === "yes";

/** Local dev: backend listens on 4000; frontend dev/preview on 5173 (see frontend/vite.config.ts). */
export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  dbPath: process.env.DB_PATH || "./data/cbt.sqlite",
  jwtSecret: process.env.JWT_SECRET || "dev_secret_only",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5173",
  /** If set with BOOTSTRAP_ADMIN_PASSWORD, creates or promotes admin on startup (production needs ALLOW_BOOTSTRAP_ADMIN). */
  bootstrapAdminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase(),
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  bootstrapAdminFullName: process.env.BOOTSTRAP_ADMIN_FULL_NAME || "Administrator",
  allowBootstrapAdmin
};

