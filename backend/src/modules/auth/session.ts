import { randomBytes } from "node:crypto";
import { env } from "../../config/index.js";

export const SESSION_COOKIE = "session";

export function createToken(): string {
  return randomBytes(32).toString("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + env.SESSION_TTL * 1000);
}