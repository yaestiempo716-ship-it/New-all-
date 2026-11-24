import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

describe("admin session tokens", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_PASSWORD = "correct horse";
  });

  it("checks the password", async () => {
    const { checkPassword } = await import("@/lib/auth");
    expect(checkPassword("correct horse")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
  });

  it("accepts its own token and rejects forged or expired ones", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth");
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    expect(verifySessionToken("9999999999999.fake")).toBe(false);
    expect(verifySessionToken(createSessionToken(Date.now() - 13 * 3600_000))).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it("a password change logs everyone out", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth");
    const token = createSessionToken();
    process.env.ADMIN_PASSWORD = "new password";
    expect(verifySessionToken(token)).toBe(false);
  });
});
