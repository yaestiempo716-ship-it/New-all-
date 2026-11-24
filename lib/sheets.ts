import "server-only";
import { sheets as sheetsApi, auth as gAuth, type sheets_v4 } from "@googleapis/sheets";
import { allNumbers, raffle } from "./config";
import { nowStamp, parseStatus } from "./format";
import type { Ticket } from "./types";
import type { AdminUpdate } from "./validation";

/**
 * ALL Google Sheets access lives in this file.
 *
 * Sheet layout (tab `raffle.sheetTab`, row 1 = headers):
 *   A number | B name | C phone | D status | E reserved_at | F note
 *
 * If the Google env vars are missing, a DEMO store (in memory) is used instead,
 * so the site works before Google is connected.
 */

export class TakenError extends Error {
  code = "TAKEN" as const;
  constructor() {
    super("This number is already taken");
  }
}

export class SheetError extends Error {
  code = "SHEET_ERROR" as const;
  constructor(message: string, public hint?: string) {
    super(message);
  }
}

export interface Store {
  mode: "google" | "demo";
  list(opts?: { fresh?: boolean }): Promise<Ticket[]>;
  reserve(number: number, name: string, phone: string): Promise<Ticket>;
  update(change: AdminUpdate): Promise<Ticket>;
  setup(): Promise<{ added: number }>;
}

export const HEADERS = ["number", "name", "phone", "status", "reserved_at", "note"];
const CACHE_MS = 5_000;

function emptyTicket(number: number): Ticket {
  return { number, name: "", phone: "", status: "available", reservedAt: "", note: "" };
}

/* ---------- per-number lock: serializes writes to the same number ---------- */
const locks = new Map<string, Promise<void>>();
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  const chained = previous.then(() => current);
  locks.set(key, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

/** Pure helper: apply an admin change to a ticket. */
export function applyUpdate(t: Ticket, change: AdminUpdate): Ticket {
  switch (change.action) {
    case "free":
      return { ...emptyTicket(t.number), note: t.note };
    case "paid":
      return { ...t, status: "paid", reservedAt: t.reservedAt || nowStamp(raffle.timeZone) };
    case "reserved":
      return { ...t, status: "reserved", reservedAt: t.reservedAt || nowStamp(raffle.timeZone) };
    case "edit": {
      const next = { ...t, name: change.name, phone: change.phone };
      if (!change.name) return { ...emptyTicket(t.number), note: t.note };
      if (next.status === "available") {
        next.status = "reserved";
        next.reservedAt = nowStamp(raffle.timeZone);
      }
      return next;
    }
  }
}

/* ============================== GOOGLE STORE ============================== */

interface Row {
  row: number; // 1-based sheet row
  ticket: Ticket;
}

export function parseRows(values: string[][] | null | undefined, startRow = 2): Map<number, Row> {
  const map = new Map<number, Row>();
  (values ?? []).forEach((r, i) => {
    const num = Number(String(r[0] ?? "").trim());
    if (!Number.isInteger(num) || num < raffle.numbers.first || num > raffle.numbers.last) return;
    if (map.has(num)) return; // first occurrence wins
    const name = String(r[1] ?? "").trim();
    map.set(num, {
      row: startRow + i,
      ticket: {
        number: num,
        name,
        phone: String(r[2] ?? "").trim(),
        status: parseStatus(r[3], name),
        reservedAt: String(r[4] ?? "").trim(),
        note: String(r[5] ?? "").trim(),
      },
    });
  });
  return map;
}

function toRowValues(t: Ticket): string[] {
  return [t.name, t.phone, t.status, t.reservedAt];
}

export function createGoogleStore(client: sheets_v4.Sheets, spreadsheetId: string): Store {
  const tab = raffle.sheetTab;
  let cache: { at: number; rows: Map<number, Row> } | null = null;
  let inflight: Promise<Map<number, Row>> | null = null;

  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof TakenError || err instanceof SheetError) throw err;
      const status = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : String(err);
      if (status === 403)
        throw new SheetError("No permission to the Google Sheet", "Share the sheet with the service account email as Editor.");
      if (status === 404) throw new SheetError("Google Sheet not found", "Check GOOGLE_SHEET_ID.");
      if (status === 429) throw new SheetError("Google Sheets is busy (quota)", "Try again in a minute.");
      if (/Unable to parse range/i.test(msg))
        throw new SheetError(`Tab "${tab}" not found`, "Open /admin and press “Set up sheet”.");
      if (/DECODER|PEM|private key|invalid_grant/i.test(msg))
        throw new SheetError("Google key is invalid", "Re-paste GOOGLE_PRIVATE_KEY exactly as in the JSON file.");
      throw new SheetError("Could not reach Google Sheets", msg.slice(0, 200));
    }
  };

  async function readRows(): Promise<Map<number, Row>> {
    const res = await client.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A2:F`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    return parseRows(res.data.values as string[][] | undefined);
  }

  async function getRows(fresh = false): Promise<Map<number, Row>> {
    if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    if (!fresh && inflight) return inflight;
    const p = readRows()
      .then((rows) => {
        cache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        if (!fresh) inflight = null;
      });
    if (!fresh) inflight = p; // concurrent visitors share one Google read
    return p;
  }

  async function writeTicket(rows: Map<number, Row>, t: Ticket): Promise<void> {
    const existing = rows.get(t.number);
    if (existing) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!B${existing.row}:E${existing.row}`,
        valueInputOption: "RAW", // RAW = values are stored as plain text, never as formulas
        requestBody: { values: [toRowValues(t)] },
      });
    } else {
      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `${tab}!A:F`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [[String(t.number), ...toRowValues(t), t.note]] },
      });
    }
    cache = null;
  }

  return {
    mode: "google",
    list: (opts) =>
      wrap(async () => {
        const rows = await getRows(opts?.fresh);
        return allNumbers().map((n) => rows.get(n)?.ticket ?? emptyTicket(n));
      }),
    reserve: (number, name, phone) =>
      wrap(() =>
        withLock(`n${number}`, async () => {
          const rows = await getRows(true); // always re-read right before writing
          const current = rows.get(number)?.ticket ?? emptyTicket(number);
          if (current.status !== "available") throw new TakenError();
          const next: Ticket = { ...current, name, phone, status: "reserved", reservedAt: nowStamp(raffle.timeZone) };
          await writeTicket(rows, next);
          return next;
        }),
      ),
    update: (change) =>
      wrap(() =>
        withLock(`n${change.number}`, async () => {
          const rows = await getRows(true);
          const current = rows.get(change.number)?.ticket ?? emptyTicket(change.number);
          const next = applyUpdate(current, change);
          await writeTicket(rows, next);
          return next;
        }),
      ),
    setup: () =>
      wrap(() =>
        withLock("setup", async () => {
          const meta = await client.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
          const exists = meta.data.sheets?.some((s) => s.properties?.title === tab);
          if (!exists) {
            await client.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] },
            });
          }
          await client.spreadsheets.values.update({
            spreadsheetId,
            range: `${tab}!A1:F1`,
            valueInputOption: "RAW",
            requestBody: { values: [HEADERS] },
          });
          const rows = await readRows();
          const missing = allNumbers().filter((n) => !rows.has(n));
          if (missing.length) {
            await client.spreadsheets.values.append({
              spreadsheetId,
              range: `${tab}!A:F`,
              valueInputOption: "RAW",
              insertDataOption: "INSERT_ROWS",
              requestBody: { values: missing.map((n) => [String(n), "", "", "available", "", ""]) },
            });
          }
          cache = null;
          return { added: missing.length };
        }),
      ),
  };
}

/* =============================== DEMO STORE =============================== */

export function createDemoStore(seed = true): Store {
  const data = new Map<number, Ticket>();
  if (seed) {
    const demo: [number, string, Ticket["status"]][] = [
      [7, "Maria Gomez", "paid"],
      [13, "Carlos Ruiz", "reserved"],
      [21, "Ana Lopez", "paid"],
      [42, "Luis Diaz", "paid"],
      [77, "Sofia Perez", "reserved"],
    ];
    for (const [n, name, status] of demo) {
      if (n >= raffle.numbers.first && n <= raffle.numbers.last)
        data.set(n, { ...emptyTicket(n), name, status, reservedAt: nowStamp(raffle.timeZone) });
    }
  }
  const get = (n: number) => data.get(n) ?? emptyTicket(n);
  return {
    mode: "demo",
    list: async () => allNumbers().map(get),
    reserve: (number, name, phone) =>
      withLock(`demo${number}`, async () => {
        if (get(number).status !== "available") throw new TakenError();
        const t: Ticket = { ...get(number), name, phone, status: "reserved", reservedAt: nowStamp(raffle.timeZone) };
        data.set(number, t);
        return t;
      }),
    update: async (change) => {
      const t = applyUpdate(get(change.number), change);
      data.set(change.number, t);
      return t;
    },
    setup: async () => ({ added: 0 }),
  };
}

/* ================================ FACTORY ================================= */

export function privateKeyFromEnv(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID,
  );
}

const g = globalThis as unknown as { __rifaStore?: Store };

export function getStore(): Store {
  if (g.__rifaStore) return g.__rifaStore;
  if (isGoogleConfigured()) {
    const jwt = new gAuth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKeyFromEnv(process.env.GOOGLE_PRIVATE_KEY),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    g.__rifaStore = createGoogleStore(sheetsApi({ version: "v4", auth: jwt }), process.env.GOOGLE_SHEET_ID!.trim());
  } else {
    g.__rifaStore = createDemoStore();
  }
  return g.__rifaStore;
}
