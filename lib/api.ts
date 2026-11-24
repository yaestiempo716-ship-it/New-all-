import "server-only";
import { NextResponse } from "next/server";
import { SheetError, TakenError } from "./sheets";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: noStore });
}

export function fail(error: string, status: number, code?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status, headers: noStore });
}

/** Turn any thrown error into a friendly JSON response. */
export function handleError(err: unknown, exposeHint = false) {
  if (err instanceof TakenError) return fail(err.message, 409, "TAKEN");
  if (err instanceof SheetError) {
    console.error("[sheets]", err.message, err.hint);
    return fail(err.message, 503, "SHEET_ERROR", exposeHint ? { hint: err.hint } : undefined);
  }
  console.error("[api]", err);
  return fail("Something went wrong. Please try again.", 500, "SERVER_ERROR");
}

/** Read JSON safely, with a size cap. */
export async function readJson(req: Request, maxBytes = 4096): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too_large");
  return text ? JSON.parse(text) : {};
}

/** Block cross-site form posts: the request must come from our own site. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / server tools
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
