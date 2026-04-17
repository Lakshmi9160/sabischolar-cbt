import { db } from "./db";
import { config } from "./config";
import { hashPassword } from "./auth";

/**
 * Ensures an admin user exists when BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD are set.
 * - New user: insert with is_admin=1.
 * - Existing user: set is_admin=1 (does not change password).
 * In production, also requires ALLOW_BOOTSTRAP_ADMIN=1.
 */
export async function bootstrapAdmin(): Promise<void> {
  const email = config.bootstrapAdminEmail;
  const password = config.bootstrapAdminPassword;
  if (!email || !password) {
    return;
  }

  if (config.nodeEnv === "production" && !config.allowBootstrapAdmin) {
    console.warn(
      "[bootstrap] BOOTSTRAP_ADMIN_* is set but ALLOW_BOOTSTRAP_ADMIN is not enabled; skipping admin bootstrap."
    );
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;

  if (existing) {
    db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(existing.id);
    console.log(`[bootstrap] Admin flag ensured for existing user: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (
      email, password_hash, is_admin, full_name, school, state, target_exam, target_exam_year, selected_subjects_json
    ) VALUES (?, ?, 1, ?, NULL, NULL, 'JAMB', 2026, ?)`
  ).run(email, passwordHash, config.bootstrapAdminFullName, JSON.stringify(["ENG", "MTH", "PHY", "BIO"]));

  console.log(`[bootstrap] Created admin user: ${email}`);
}
