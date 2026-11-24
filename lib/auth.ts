import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "rifa_admin";
const SESSION_HOURS = 12;

/** In local development only, "admin" works if no password is set. */
export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD?.trim();
  if (p) return p;
  return process.env.NODE_ENV === "production" ? null : "admin";
}

function secret(): string {
  return `rifa-session:${adminPassword() ?? ""}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const real = adminPassword();
  if (!real) return false;
  const h = (s: string) => createHmac("sha256", "cmp").update(s).digest("hex");
  return safeEqual(h(input), h(real));
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_HOURS * 3600_000);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !adminPassword()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < now) return false;
  return safeEqual(sig, sign(exp));
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_HOURS * 3600,
};
