import { getStore } from "@/lib/sheets";
import { maskName } from "@/lib/format";
import { ok, handleError } from "@/lib/api";
import type { PublicTicket } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public list: number + status + masked name only. */
export async function GET() {
  try {
    const tickets = await getStore().list();
    const data: PublicTicket[] = tickets.map((t) =>
      t.status === "available" ? { number: t.number, status: t.status } : { number: t.number, status: t.status, name: maskName(t.name) },
    );
    return ok({ tickets: data, updatedAt: new Date().toISOString() });
  } catch (err) {
    return handleError(err);
  }
}
