import type { Status } from "./types";

/** "Maria Gomez Lopez" -> "Maria G." — what the public sees. */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0].length > 14 ? parts[0].slice(0, 14) + "…" : parts[0];
  return parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first;
}

// Control characters, zero-width and bidi-override characters
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g;

/** Remove control characters and collapse spaces. */
export function cleanText(value: string, max: number): string {
  return value
    .normalize("NFC")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const STATUS_ALIASES: Record<string, Status> = {
  available: "available",
  disponible: "available",
  libre: "available",
  free: "available",
  reserved: "reserved",
  reservado: "reserved",
  apartado: "reserved",
  pending: "reserved",
  pendiente: "reserved",
  paid: "paid",
  pagado: "paid",
  pago: "paid",
  sold: "paid",
  vendido: "paid",
};

/**
 * Work out a row's status from what is in the sheet, tolerating hand edits:
 * Spanish words, capitals, or a name typed without any status.
 */
export function parseStatus(rawStatus: string | undefined, name: string | undefined): Status {
  const key = (rawStatus ?? "").trim().toLowerCase();
  const mapped = STATUS_ALIASES[key];
  if (mapped) return mapped; // an explicit status always wins
  return name?.trim() ? "reserved" : "available"; // blank/unknown status: a name means taken
}

export function nowStamp(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
