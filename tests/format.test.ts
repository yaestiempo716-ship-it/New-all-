import { describe, expect, it } from "vitest";
import { cleanText, maskName, nowStamp, parseStatus } from "@/lib/format";

describe("maskName", () => {
  it("shows first name and last initial", () => {
    expect(maskName("Maria Gomez Lopez")).toBe("Maria G.");
    expect(maskName("  ana   lopez ")).toBe("ana L.");
    expect(maskName("Pedro")).toBe("Pedro");
    expect(maskName("")).toBe("");
  });
});

describe("cleanText", () => {
  it("strips control and invisible characters and trims", () => {
    expect(cleanText("  Ma\u0000ria​  \n Gomez ", 40)).toBe("Maria Gomez");
    expect(cleanText("x".repeat(100), 40)).toHaveLength(40);
  });
});

describe("parseStatus", () => {
  it("understands English, Spanish and capitals", () => {
    expect(parseStatus("PAID", "x")).toBe("paid");
    expect(parseStatus("Pagado", "x")).toBe("paid");
    expect(parseStatus("reservado", "x")).toBe("reserved");
    expect(parseStatus("disponible", "")).toBe("available");
  });
  it("explicit available wins even if a name was left", () => {
    expect(parseStatus("available", "Maria")).toBe("available");
  });
  it("blank status with a name counts as taken", () => {
    expect(parseStatus("", "Maria")).toBe("reserved");
    expect(parseStatus(undefined, "")).toBe("available");
    expect(parseStatus("whatever", "")).toBe("available");
  });
});

describe("nowStamp", () => {
  it("formats in the given time zone", () => {
    expect(nowStamp("UTC", new Date("2026-01-02T03:04:00Z"))).toBe("2026-01-02 03:04");
  });
});
