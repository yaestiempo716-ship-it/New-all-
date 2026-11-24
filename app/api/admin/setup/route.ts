import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/sheets";
import { fail, handleError, ok, sameOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Creates the tab, the header row and one row per number (only missing ones). Safe to run twice. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403, "FORBIDDEN");
  if (!(await isAdmin())) return fail("Not logged in", 401, "UNAUTHORIZED");
  try {
    return ok(await getStore().setup());
  } catch (err) {
    return handleError(err, true);
  }
}
