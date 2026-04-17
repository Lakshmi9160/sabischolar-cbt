import crypto from "crypto";
import type { Router } from "express";
import { db } from "../db";
import { AuthedRequest, hashPassword, requireAuth, signToken, verifyPassword } from "../auth";

export function mountHealthAuth(router: Router): void {
  router.get("/health", (_req, res) => {
    try {
      db.prepare("SELECT 1 AS ok").get();
      res.json({ status: "ok", service: "cbt-v1", database: "connected" });
    } catch (err) {
      console.error("[health] database check failed", err);
      res.status(503).json({ status: "error", service: "cbt-v1", database: "disconnected" });
    }
  });

  router.post("/auth/register", async (req, res) => {
    const { email, password, fullName, school, state, targetExam, targetExamYear, selectedSubjects, sabischolarUserId } = req.body;
    if (!email || !password || !fullName) {
      res.status(400).json({ message: "email, password, fullName required" });
      return;
    }
    try {
      const passwordHash = await hashPassword(password);
      const result = db
        .prepare(
          `INSERT INTO users (sabischolar_user_id, email, password_hash, full_name, school, state, target_exam, target_exam_year, selected_subjects_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          sabischolarUserId ?? null,
          email.toLowerCase(),
          passwordHash,
          fullName,
          school ?? null,
          state ?? null,
          targetExam ?? null,
          targetExamYear ?? null,
          JSON.stringify(selectedSubjects ?? [])
        );
      const userId = Number(result.lastInsertRowid);
      const token = signToken({ userId, email: email.toLowerCase() });
      res.json({ token, user: { id: userId, email, fullName } });
    } catch {
      res.status(409).json({ message: "Email already exists" });
    }
  });

  router.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = db
      .prepare("SELECT id, email, full_name, password_hash FROM users WHERE email = ?")
      .get((email ?? "").toLowerCase()) as
      | { id: number; email: string; full_name: string; password_hash: string }
      | undefined;
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }
    const isValid = await verifyPassword(password ?? "", user.password_hash);
    if (!isValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }
    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, fullName: user.full_name } });
  });

  router.get("/auth/profile", requireAuth, (req: AuthedRequest, res) => {
    const user = db
      .prepare(
        "SELECT id, sabischolar_user_id, email, is_admin, full_name, school, state, target_exam, target_exam_year, selected_subjects_json FROM users WHERE id = ?"
      )
      .get(req.user!.userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json(user);
  });

  router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
    const user = db
      .prepare(
        "SELECT id, sabischolar_user_id, email, is_admin, full_name, school, state, target_exam, target_exam_year, selected_subjects_json FROM users WHERE id = ?"
      )
      .get(req.user!.userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json(user);
  });

  router.post("/auth/request-verification", requireAuth, (req: AuthedRequest, res) => {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(
      req.user!.userId,
      token,
      expiresAt
    );
    res.json({ ok: true, token });
  });

  router.post("/auth/verify-email", (req, res) => {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ message: "token required" });
      return;
    }
    const row = db
      .prepare(
        "SELECT id, user_id FROM email_verification_tokens WHERE token = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')"
      )
      .get(token) as { id: number; user_id: number } | undefined;

    if (!row) {
      res.status(400).json({ message: "Invalid or expired token" });
      return;
    }

    db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(row.user_id);
    db.prepare("UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  router.post("/auth/request-password-reset", (req, res) => {
    const { email } = req.body;
    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get((email ?? "").toLowerCase()) as { id: number } | undefined;

    if (!user) {
      res.json({ ok: true });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(
      user.id,
      token,
      expiresAt
    );

    res.json({ ok: true, token });
  });

  router.post("/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ message: "token and newPassword required" });
      return;
    }

    const row = db
      .prepare(
        "SELECT id, user_id FROM password_reset_tokens WHERE token = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')"
      )
      .get(token) as { id: number; user_id: number } | undefined;

    if (!row) {
      res.status(400).json({ message: "Invalid or expired token" });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });
}
