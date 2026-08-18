import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/index.js", () => ({
  env: { SESSION_TTL: 86400 },
}));

import { createToken, sessionExpiry } from "./session.js";

describe("session", () => {
  it("creates a 64-char hex token", () => {
    const token = createToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(createToken()).not.toBe(token);
  });

  it("computes expiry from SESSION_TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    const expiry = sessionExpiry();
    expect(expiry.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    vi.useRealTimers();
  });
});
