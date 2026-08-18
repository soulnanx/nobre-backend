import type { Context, Next } from "hono";
import type { AppEnv } from "../types/app.js";

export async function logger(
  c: Context<AppEnv>,
  next: Next,
): Promise<void | Response> {
  const started = Date.now();
  await next();
  const durationMs = Date.now() - started;
  const url = new URL(c.req.url);
  console.log(
    JSON.stringify({
      level: "info",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: url.pathname,
      status: c.res.status,
      durationMs,
    }),
  );
}
