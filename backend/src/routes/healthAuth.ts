import crypto from "crypto";
import type { Router } from "express";
import { config, isMailConfigured } from "../config";
import { db } from "../db";
import { AuthedRequest, hashPassword, requireAuth, signToken, verifyPassword } from "../auth";
import { sendTransactionalMail } from "../mail";
import {
  loginLimiter,
  passwordResetRequestLimiter,
  registerLimiter,
  tokenActionLimiter,
  verificationRequestLimiter
} from "../rateLimiters";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  router.post("/auth/register", registerLimiter, async (req, res) => {
    const { email, password, fullName, school, state, targetExam, targetExamYear, selectedSubjects, sabischolarUserId } = req.body;
    if (!email || !password || !fullName) {
      res.status(400).json({ message: "email, password, fullName required" });
      return;
    }

    const rawExam =
      targetExam == null || targetExam === "" ? "" : String(targetExam).trim().toUpperCase();
    const normTarget: string | null = rawExam === "" ? null : rawExam;
    if (normTarget != null && normTarget !== "JAMB" && normTarget !== "WAEC" && normTarget !== "NECO") {
      res.status(400).json({ message: "targetExam must be JAMB, WAEC, or NECO" });
      return;
    }

    let normYear: number | null = null;
    if (targetExamYear != null && targetExamYear !== "") {
      const y = Number(targetExamYear);
      if (!Number.isFinite(y) || y < 2000 || y > 2100) {
        res.status(400).json({ message: "targetExamYear must be between 2000 and 2100" });
        return;
      }
      normYear = Math.trunc(y);
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
          normTarget,
          normYear,
          JSON.stringify(selectedSubjects ?? [])
        );
      const userId = Number(result.lastInsertRowid);
      const token = signToken({ userId, email: email.toLowerCase() });
      res.json({ token, user: { id: userId, email, fullName } });
    } catch {
      res.status(409).json({ message: "Email already exists" });
    }
  });

  router.post("/auth/login", loginLimiter, async (req, res) => {
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

  /** Partial update: targetExam, targetExamYear, fullName, school, state (camelCase in JSON). */
  router.patch("/auth/profile", requireAuth, (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const row = db
      .prepare(
        "SELECT full_name, school, state, target_exam, target_exam_year FROM users WHERE id = ?"
      )
      .get(userId) as
      | {
          full_name: string;
          school: string | null;
          state: string | null;
          target_exam: string | null;
          target_exam_year: number | null;
        }
      | undefined;
    if (!row) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    let full_name = row.full_name;
    let school = row.school;
    let state = row.state;
    let target_exam = row.target_exam;
    let target_exam_year = row.target_exam_year;

    if (Object.prototype.hasOwnProperty.call(body, "fullName")) {
      const v = body.fullName;
      if (v == null || String(v).trim() === "") {
        res.status(400).json({ message: "fullName cannot be empty" });
        return;
      }
      full_name = String(v).trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, "school")) {
      const v = body.school;
      school = v == null || String(v).trim() === "" ? null : String(v).trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, "state")) {
      const v = body.state;
      state = v == null || String(v).trim() === "" ? null : String(v).trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, "targetExam")) {
      const v = body.targetExam;
      if (v == null || v === "") {
        target_exam = null;
      } else {
        const u = String(v).trim().toUpperCase();
        if (u !== "JAMB" && u !== "WAEC" && u !== "NECO") {
          res.status(400).json({ message: "targetExam must be JAMB, WAEC, or NECO" });
          return;
        }
        target_exam = u;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "targetExamYear")) {
      const v = body.targetExamYear;
      if (v == null || v === "") {
        target_exam_year = null;
      } else {
        const y = Number(v);
        if (!Number.isFinite(y) || y < 2000 || y > 2100) {
          res.status(400).json({ message: "targetExamYear must be between 2000 and 2100" });
          return;
        }
        target_exam_year = Math.trunc(y);
      }
    }

    db.prepare(
      "UPDATE users SET full_name = ?, school = ?, state = ?, target_exam = ?, target_exam_year = ? WHERE id = ?"
    ).run(full_name, school, state, target_exam, target_exam_year, userId);

    res.json({
      ok: true,
      profile: {
        fullName: full_name,
        targetExam: target_exam,
        targetExamYear: target_exam_year
      }
    });
  });

  router.post(
    "/auth/request-verification",
    verificationRequestLimiter,
    requireAuth,
    async (req: AuthedRequest, res) => {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(
      req.user!.userId,
      token,
      expiresAt
    );

    if (isMailConfigured()) {
      const row = db.prepare("SELECT email, full_name FROM users WHERE id = ?").get(req.user!.userId) as
        | { email: string; full_name: string }
        | undefined;
      if (!row) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      const base = config.appBaseUrl.replace(/\/$/, "");
      const verifyUrl = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
      const subject = "Verify your SabiScholar CBT email";
      const text = `Hi ${row.full_name},\n\nOpen this link to verify your email (expires in 1 hour):\n${verifyUrl}\n\nIf you did not request this, you can ignore this message.\n`;
      const html = `<p>Hi ${escapeHtml(row.full_name)},</p><p><a href="${verifyUrl}">Verify your email</a> (expires in 1 hour).</p><p>If you did not request this, ignore this message.</p>`;
      try {
        await sendTransactionalMail({ to: row.email, subject, text, html });
        res.json({ ok: true, sent: true });
      } catch (err) {
        console.error("[mail] request-verification", err);
        res.status(502).json({ message: "Could not send verification email. Try again later." });
      }
      return;
    }

    res.json({ ok: true, token });
  });

  router.post("/auth/verify-email", tokenActionLimiter, (req, res) => {
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

  router.post("/auth/request-password-reset", passwordResetRequestLimiter, async (req, res) => {
    const { email } = req.body;
    const user = db
      .prepare("SELECT id, email, full_name FROM users WHERE email = ?")
      .get((email ?? "").toLowerCase()) as { id: number; email: string; full_name: string } | undefined;

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

    if (isMailConfigured()) {
      const base = config.appBaseUrl.replace(/\/$/, "");
      const resetUrl = `${base}/auth/reset?token=${encodeURIComponent(token)}`;
      const subject = "Reset your SabiScholar CBT password";
      const text = `Hi ${user.full_name},\n\nReset your password using this link (expires in 1 hour):\n${resetUrl}\n\nIf you did not request a reset, ignore this message.\n`;
      const html = `<p>Hi ${escapeHtml(user.full_name)},</p><p><a href="${resetUrl}">Reset your password</a> (expires in 1 hour).</p><p>If you did not request this, ignore this message.</p>`;
      try {
        await sendTransactionalMail({ to: user.email, subject, text, html });
        res.json({ ok: true, sent: true });
      } catch (err) {
        console.error("[mail] request-password-reset", err);
        res.status(502).json({ message: "Could not send reset email. Try again later." });
      }
      return;
    }

    res.json({ ok: true, token });
  });

  router.post("/auth/reset-password", tokenActionLimiter, async (req, res) => {
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
