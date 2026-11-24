import { getStore } from "@/lib/sheets";
import { reserveSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fail, handleError, ok, readJson, sameOrigin } from "@/lib/api";
import { maskName } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403, "FORBIDDEN");

  const ip = clientIp(req);
  if (!rateLimit(`reserve:${ip}`, 6, 60_000) || !rateLimit(`reserve-h:${ip}`, 30, 3_600_000)) {
    return fail("Too many attempts. Please wait a minute.", 429, "RATE_LIMITED");
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return fail("Invalid request", 400, "BAD_REQUEST");
  }

  const parsed = reserveSchema.safeParse(body);
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message ?? "invalid";
    return fail("Please check your details", 400, code.startsWith("name_") || code.startsWith("phone_") ? code : "INVALID");
  }

  const { number, name, phone, website } = parsed.data;
  // Honeypot filled → pretend success, write nothing.
  if (website) return ok({ number, name: maskName(name) });

  try {
    const t = await getStore().reserve(number, name, phone);
    return ok({ number: t.number, name: maskName(t.name) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
