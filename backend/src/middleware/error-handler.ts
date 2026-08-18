import type { Context, Next } from "hono";
import type { AppEnv } from "../types/app.js";

export async function errorHandler(
  c: Context<AppEnv>,
  next: Next,
): Promise<Response | void> {
  try {
    await next();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        requestId: c.get("requestId"),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    return c.json({ error: "internal" }, 500);
  }
}
