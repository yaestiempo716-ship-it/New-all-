import { describe, expect, it, vi } from "vitest";
import type { sheets_v4 } from "@googleapis/sheets";
import { createDemoStore, createGoogleStore, parseRows, privateKeyFromEnv, TakenError, SheetError } from "@/lib/sheets";
import { raffle } from "@/lib/config";

const F = raffle.numbers.first;

/** A tiny fake of the Google Sheets client backed by a 2D array. */
function fakeSheets(initial: string[][], opts: { delayMs?: number } = {}) {
  const grid: string[][] = initial.map((r) => [...r]); // grid[0] = header row (sheet row 1)
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  const update = vi.fn(async ({ range, requestBody }: { range: string; valueInputOption?: string; requestBody: { values: string[][] } }) => {
    await wait();
    const m = /!([A-F])(\d+):([A-F])(\d+)/.exec(range)!;
    const col = m[1].charCodeAt(0) - 65;
    const row = Number(m[2]) - 1;
    grid[row] = grid[row] ?? [];
    requestBody.values[0].forEach((v, i) => (grid[row][col + i] = v));
    return { data: {} };
  });
  const append = vi.fn(async ({ requestBody }: { requestBody: { values: string[][] } }) => {
    await wait();
    grid.push(...requestBody.values.map((r) => [...r]));
    return { data: {} };
  });
  const get = vi.fn(async () => {
    await wait();
    return { data: { values: grid.slice(1).map((r) => [...r]) } };
  });
  const client = {
    spreadsheets: {
      values: { get, update, append },
      get: vi.fn(async () => ({ data: { sheets: [{ properties: { title: raffle.sheetTab } }] } })),
      batchUpdate: vi.fn(async () => ({ data: {} })),
    },
  } as unknown as sheets_v4.Sheets;
  return { client, grid, update, append, get };
}

const header = ["number", "name", "phone", "status", "reserved_at", "note"];

describe("parseRows", () => {
  it("maps rows to tickets with their sheet row number and ignores junk", () => {
    const rows = parseRows([[String(F), "Ana", "", "paid"], ["hello"], [String(F + 1)], [String(F), "Dup", "", "reserved"]]);
    expect(rows.get(F)?.row).toBe(2);
    expect(rows.get(F)?.ticket.status).toBe("paid");
    expect(rows.get(F + 1)?.row).toBe(4);
    expect(rows.get(F + 1)?.ticket.status).toBe("available");
    expect(rows.size).toBe(2);
  });
});

describe("google store", () => {
  it("reserves a free number by writing only its own row (B:E)", async () => {
    const { client, grid, update } = fakeSheets([header, [String(F), "", "", "available", "", "keep me"]]);
    const store = createGoogleStore(client, "sheet");
    const t = await store.reserve(F, "Maria Gomez", "+1555");
    expect(t.status).toBe("reserved");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].range).toBe(`${raffle.sheetTab}!B2:E2`);
    expect(update.mock.calls[0][0].valueInputOption).toBe("RAW");
    expect(grid[1].slice(1, 4)).toEqual(["Maria Gomez", "+1555", "reserved"]);
    expect(grid[1][5]).toBe("keep me"); // owner's note untouched
  });

  it("refuses a number that is already taken", async () => {
    const { client } = fakeSheets([header, [String(F), "Ana", "", "paid"]]);
    await expect(createGoogleStore(client, "s").reserve(F, "Bob", "")).rejects.toBeInstanceOf(TakenError);
  });

  it("sees hand edits in the sheet even if the list was cached", async () => {
    const { client, grid } = fakeSheets([header, [String(F), "", "", "available"]]);
    const store = createGoogleStore(client, "s");
    expect((await store.list())[0].status).toBe("available");
    grid[1] = [String(F), "Owner typed this", "", "paid"]; // owner edits the sheet
    await expect(store.reserve(F, "Bob", "")).rejects.toBeInstanceOf(TakenError);
  });

  it("two people picking the same number at the same time: only one wins", async () => {
    const { client, grid } = fakeSheets([header, [String(F), "", "", "available"]], { delayMs: 5 });
    const store = createGoogleStore(client, "s");
    const results = await Promise.allSettled([store.reserve(F, "First Person", ""), store.reserve(F, "Second Person", "")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(grid[1][1]).toBe("First Person");
  });

  it("appends a row if the number is missing from the sheet", async () => {
    const { client, grid, append } = fakeSheets([header]);
    await createGoogleStore(client, "s").reserve(F, "Ana Lopez", "");
    expect(append).toHaveBeenCalledTimes(1);
    expect(grid[1][0]).toBe(String(F));
    expect(grid[1][3]).toBe("reserved");
  });

  it("list returns every number in the range", async () => {
    const { client } = fakeSheets([header]);
    const list = await createGoogleStore(client, "s").list();
    expect(list).toHaveLength(raffle.numbers.last - raffle.numbers.first + 1);
  });

  it("free clears the name/phone/status but keeps the note", async () => {
    const { client, grid } = fakeSheets([header, [String(F), "Ana", "1", "paid", "x", "vip"]]);
    await createGoogleStore(client, "s").update({ action: "free", number: F });
    expect(grid[1]).toEqual([String(F), "", "", "available", "", "vip"]);
  });

  it("setup adds only the missing numbers", async () => {
    const { client, append } = fakeSheets([header, [String(F), "Ana", "", "paid"]]);
    const r = await createGoogleStore(client, "s").setup();
    expect(r.added).toBe(raffle.numbers.last - raffle.numbers.first);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it("turns Google permission errors into a helpful message", async () => {
    const { client } = fakeSheets([header]);
    (client.spreadsheets.values.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: 403 }));
    const err = await createGoogleStore(client, "s").list().catch((e) => e);
    expect(err).toBeInstanceOf(SheetError);
    expect(err.hint).toMatch(/Share the sheet/);
  });
});

describe("demo store", () => {
  it("prevents double booking", async () => {
    const store = createDemoStore(false);
    const results = await Promise.allSettled([store.reserve(F, "A b", ""), store.reserve(F, "C d", "")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("privateKeyFromEnv", () => {
  it("turns \\n into real newlines and strips quotes", () => {
    expect(privateKeyFromEnv('"-----BEGIN-----\\nabc\\n-----END-----\\n"')).toBe("-----BEGIN-----\nabc\n-----END-----\n");
  });
});
