import rateLimit from "express-rate-limit";
import { config } from "./config";

const prod = config.nodeEnv === "production";

function jsonMessage(windowMs: number) {
  return { message: "Too many requests. Try again later.", retryAfterMs: windowMs };
}

/** Register: cap account creation per IP. */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: prod ? 25 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(15 * 60 * 1000)
});

/** Login: slow brute-force attempts per IP. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: prod ? 40 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(15 * 60 * 1000)
});

/** Password-reset request: limits email abuse and user enumeration load. */
export const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: prod ? 10 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(60 * 60 * 1000)
});

/** Resend verification email. */
export const verificationRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: prod ? 10 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(60 * 60 * 1000)
});

/** Token submission endpoints (verify email, complete reset). */
export const tokenActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: prod ? 60 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(15 * 60 * 1000)
});
