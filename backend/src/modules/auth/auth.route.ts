import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../../types/app.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { env } from "../../config/index.js";
import { SESSION_COOKIE } from "./session.js";
import * as service from "./auth.service.js";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(254),
  password: z.string().min(4).max(128),
});

export const authRoutes = new Hono<AppEnv>();

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL,
  });
}

authRoutes.post(
  "/register",
  rateLimit(env.RATE_LIMIT_REGISTER),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid-credentials" }, 400);

    const result = await service.register(
      parsed.data.username,
      parsed.data.password,
    );
    if (!result.ok) return c.json({ error: result.error }, 409);

    setSessionCookie(c, result.token);
    return c.json({ user: result.user }, 201);
  },
);

authRoutes.post(
  "/login",
  rateLimit(env.RATE_LIMIT_LOGIN),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid" }, 401);

    const result = await service.login(
      parsed.data.username,
      parsed.data.password,
    );
    if (!result.ok) return c.json({ error: result.error }, 401);

    setSessionCookie(c, result.token);
    return c.json({ user: result.user }, 200);
  },
);

authRoutes.post("/logout", authGuard, async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await service.logout(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

authRoutes.get("/me", authGuard, async (c) => {
  const user = await service.getUserById(c.get("userId"));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user }, 200);
});
