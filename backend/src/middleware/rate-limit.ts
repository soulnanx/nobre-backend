import type { Context, Next } from "hono";
import type { AppEnv } from "../types/app.js";

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

function clientIp(c: Context<AppEnv>): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

export function rateLimit(limit: number) {
  return async (c: Context<AppEnv>, next: Next): Promise<void | Response> => {
    const key = clientIp(c);
    const now = Date.now();
    const bucket = buckets.get(key) ?? { timestamps: [] };

    bucket.timestamps = bucket.timestamps.filter(
      (t) => now - t < WINDOW_MS,
    );

    if (bucket.timestamps.length >= limit) {
      buckets.set(key, bucket);
      return c.json({ error: "rate-limit" }, 429);
    }

    bucket.timestamps.push(now);
    buckets.set(key, bucket);
    return next();
  };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter(
      (t) => now - t < WINDOW_MS,
    );
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

cleanup.unref();
