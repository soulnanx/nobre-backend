import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../types/app.js";
import { SESSION_COOKIE } from "../modules/auth/session.js";
import { getUserByToken } from "../modules/auth/auth.service.js";

export async function authGuard(
  c: Context<AppEnv>,
  next: Next,
): Promise<void | Response> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "unauthorized" }, 401);

  const user = await getUserByToken(token);
  if (!user) return c.json({ error: "unauthorized" }, 401);

  c.set("userId", user.id);
  return next();
}
