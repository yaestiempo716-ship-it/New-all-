import RaffleApp from "@/components/RaffleApp";
import { getStore } from "@/lib/sheets";
import { maskName } from "@/lib/format";
import type { PublicTicket } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Render the grid on the server for a fast first paint; the client then keeps it live.
  let initial: PublicTicket[] | null = null;
  try {
    const tickets = await getStore().list();
    initial = tickets.map((t) =>
      t.status === "available" ? { number: t.number, status: t.status } : { number: t.number, status: t.status, name: maskName(t.name) },
    );
  } catch {
    initial = null; // client will retry and show a friendly error
  }
  return <RaffleApp initial={initial} />;
}
