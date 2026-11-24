import { NextResponse } from "next/server";
import { adminPassword, checkPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fail, readJson, sameOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403, "FORBIDDEN");
  if (!adminPassword()) return fail("ADMIN_PASSWORD is not set on the server.", 503, "NO_PASSWORD");
  if (!rateLimit(`login:${clientIp(req)}`, 8, 15 * 60_000)) {
    return fail("Too many attempts. Try again in 15 minutes.", 429, "RATE_LIMITED");
  }
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return fail("Invalid request", 400, "BAD_REQUEST");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success || !checkPassword(parsed.data.password)) {
    return fail("Wrong password", 401, "WRONG_PASSWORD");
  }
  const res = NextResponse.json({ ok: true, data: null });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  return res;
}
