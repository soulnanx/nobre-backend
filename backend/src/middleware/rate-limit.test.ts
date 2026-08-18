import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit.js";

function buildApp(limit: number) {
  const app = new Hono();
  app.use("/test", rateLimit(limit));
  app.post("/test", (c) => c.json({ ok: true }, 200));
  return app;
}

describe("rate-limit", () => {
  it("allows up to limit and blocks beyond it", async () => {
    const app = buildApp(3);
    let last = 0;
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/test", { method: "POST" });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("counts requests within the window independently per IP", async () => {
    const app = buildApp(2);
    await app.request("/test", { method: "POST" });
    await app.request("/test", { method: "POST" });
    const blocked = await app.request("/test", { method: "POST" });
    expect(blocked.status).toBe(429);

    const other = await app.request("/test", {
      method: "POST",
      headers: { "x-real-ip": "10.0.0.99" },
    });
    expect(other.status).toBe(200);
  });

  it("returns a readable error body", async () => {
    const app = buildApp(1);
    await app.request("/test", { method: "POST" });
    const res = await app.request("/test", { method: "POST" });
    await expect(res.json()).resolves.toEqual({ error: "rate-limit" });
  });
});
