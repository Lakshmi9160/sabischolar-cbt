import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { config } from "./config";
import { isAdminUser } from "./sessionScoring";

export type AuthPayload = { userId: number; email: string };

/** Issues a JWT with `sub` (string user id) for main-app alignment; `userId` kept for this codebase. */
export function signToken(payload: AuthPayload): string {
  const email = payload.email.toLowerCase();
  return jwt.sign(
    { userId: payload.userId, email, sub: String(payload.userId) },
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload & {
    userId?: number;
    email?: string;
  };
  const emailRaw = typeof decoded.email === "string" ? decoded.email.trim() : "";
  if (!emailRaw) {
    throw new jwt.JsonWebTokenError("Invalid token payload");
  }
  const email = emailRaw.toLowerCase();

  let userId: number;
  if (typeof decoded.userId === "number" && Number.isFinite(decoded.userId)) {
    userId = decoded.userId;
  } else if (decoded.sub != null && String(decoded.sub).length > 0) {
    const n = Number(String(decoded.sub));
    if (!Number.isFinite(n)) {
      throw new jwt.JsonWebTokenError("Invalid token sub");
    }
    userId = n;
  } else {
    throw new jwt.JsonWebTokenError("Invalid token payload");
  }

  return { userId, email };
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type AuthedRequest = Request & { user?: AuthPayload };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }
  try {
    const token = authHeader.slice("Bearer ".length);
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

/** Use after `requireAuth`. Returns 403 if the user is not an admin. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!isAdminUser(req.user.userId)) {
    res.status(403).json({ message: "Admin access required." });
    return;
  }
  next();
}

