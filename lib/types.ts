export type Status = "available" | "reserved" | "paid";

/** A full ticket row, as stored in the sheet (server/admin only). */
export interface Ticket {
  number: number;
  name: string;
  phone: string;
  status: Status;
  reservedAt: string;
  note: string;
}

/** What the public page receives — no phone, no notes, masked name. */
export interface PublicTicket {
  number: number;
  status: Status;
  name?: string;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };
