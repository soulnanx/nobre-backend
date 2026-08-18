import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/app.js";

export async function requestId(
  c: Context<AppEnv>,
  next: Next,
): Promise<void | Response> {
  const id = c.req.header("x-request-id") ?? randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  return next();
}
