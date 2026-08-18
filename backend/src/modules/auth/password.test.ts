import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("segredo123");
    expect(hash).toContain(":");
    await expect(verifyPassword("segredo123", hash)).resolves.toBe(true);
    await expect(verifyPassword("errada", hash)).resolves.toBe(false);
  });

  it("produces unique salts per hash", async () => {
    const [h1, h2] = await Promise.all([
      hashPassword("mesma-senha"),
      hashPassword("mesma-senha"),
    ]);
    expect(h1).not.toBe(h2);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", "somente-um-campo")).resolves.toBe(false);
    await expect(verifyPassword("x", "abc:def:ghi")).resolves.toBe(false);
  });
});
