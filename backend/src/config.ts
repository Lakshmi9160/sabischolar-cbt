import dotenv from "dotenv";

dotenv.config();

const allowFlag = process.env.ALLOW_BOOTSTRAP_ADMIN;
const allowBootstrapAdmin =
  allowFlag === "1" || allowFlag === "true" || allowFlag === "yes";

const trustProxyFlag = process.env.TRUST_PROXY;
const trustProxy =
  trustProxyFlag === "1" || trustProxyFlag === "true" || trustProxyFlag === "yes";

/** Comma-separated browser origins allowed for CORS (e.g. https://app.example.com). Empty = reflect any origin (dev-friendly). */
const corsRaw = (process.env.CORS_ALLOWED_ORIGINS || "").trim();
const corsAllowedOrigins = corsRaw
  ? corsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

/** Local dev: backend listens on 4000; frontend dev/preview on 5173 (see frontend/vite.config.ts). */
const smtpHost = (process.env.SMTP_HOST || "").trim();
const mailFrom = (process.env.MAIL_FROM || "").trim();

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
  allowBootstrapAdmin,
  /** When SMTP_HOST + MAIL_FROM are set, verification/reset emails are sent and tokens are not returned in API JSON. */
  smtpHost,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "1" || process.env.SMTP_SECURE === "true",
  smtpUser: (process.env.SMTP_USER || "").trim(),
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom,
  /** Absolute or cwd-relative path to Vite `dist` (index.html + assets). When set, Express serves the SPA and `/api/*` stays on this server. */
  frontendDist: (process.env.FRONTEND_DIST || "").trim(),
  /** When true, Express honors `X-Forwarded-*` (set behind nginx, Railway, Fly, etc.). */
  trustProxy,
  corsAllowedOrigins
};

export function isMailConfigured(): boolean {
  return Boolean(smtpHost && mailFrom);
}

