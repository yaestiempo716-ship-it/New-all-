import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/sheets";
import { adminUpdateSchema } from "@/lib/validation";
import { fail, handleError, ok, readJson, sameOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Forbidden", 403, "FORBIDDEN");
  if (!(await isAdmin())) return fail("Not logged in", 401, "UNAUTHORIZED");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return fail("Invalid request", 400, "BAD_REQUEST");
  }
  const parsed = adminUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid change", 400, "INVALID");
  try {
    return ok(await getStore().update(parsed.data));
  } catch (err) {
    return handleError(err, true);
  }
}
