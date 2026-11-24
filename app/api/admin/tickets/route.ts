import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/sheets";
import { fail, handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Full data (names, phones, notes) — admin only. */
export async function GET() {
  if (!(await isAdmin())) return fail("Not logged in", 401, "UNAUTHORIZED");
  try {
    const store = getStore();
    const tickets = await store.list();
    const sheetUrl = process.env.GOOGLE_SHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(process.env.GOOGLE_SHEET_ID.trim())}/edit`
      : null;
    return ok({ tickets, mode: store.mode, sheetUrl, serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null });
  } catch (err) {
    return handleError(err, true);
  }
}
