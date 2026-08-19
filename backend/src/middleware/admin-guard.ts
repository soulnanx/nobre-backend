import type { Context, Next } from "hono";
import type { AppEnv } from "../types/app.js";
import { getUserById } from "../modules/auth/auth.service.js";

export async function adminGuard(
  c: Context<AppEnv>,
  next: Next,
): Promise<void | Response> {
  const user = await getUserById(c.get("userId"));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "forbidden" }, 403);

  return next();
}
