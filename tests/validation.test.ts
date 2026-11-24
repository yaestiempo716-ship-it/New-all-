import { describe, expect, it } from "vitest";
import { reserveSchema, adminUpdateSchema } from "@/lib/validation";
import { raffle } from "@/lib/config";

describe("reserveSchema", () => {
  it("accepts a normal reservation and cleans the name", () => {
    const r = reserveSchema.parse({ number: raffle.numbers.first, name: "  María   Gómez ", phone: "+1 555 123 4567" });
    expect(r.name).toBe("María Gómez");
    expect(r.phone).toBe("+1 555 123 4567");
  });
  it("rejects numbers out of range or not integers", () => {
    expect(reserveSchema.safeParse({ number: raffle.numbers.last + 1, name: "Ana" }).success).toBe(false);
    expect(reserveSchema.safeParse({ number: raffle.numbers.first - 1, name: "Ana" }).success).toBe(false);
    expect(reserveSchema.safeParse({ number: 1.5, name: "Ana" }).success).toBe(false);
    expect(reserveSchema.safeParse({ number: "5", name: "Ana" }).success).toBe(false);
  });
  it("rejects too-short or letterless names", () => {
    expect(reserveSchema.safeParse({ number: raffle.numbers.first, name: "A" }).success).toBe(false);
    expect(reserveSchema.safeParse({ number: raffle.numbers.first, name: "1234" }).success).toBe(false);
  });
  it("rejects garbage phone numbers", () => {
    expect(reserveSchema.safeParse({ number: raffle.numbers.first, name: "Ana", phone: "call me" }).success).toBe(false);
  });
  it("caps name length at 40", () => {
    const r = reserveSchema.parse({ number: raffle.numbers.first, name: "A".repeat(150) });
    expect(r.name.length).toBe(40);
  });
});

describe("adminUpdateSchema", () => {
  it("only allows known actions", () => {
    expect(adminUpdateSchema.safeParse({ action: "paid", number: raffle.numbers.first }).success).toBe(true);
    expect(adminUpdateSchema.safeParse({ action: "delete_everything", number: raffle.numbers.first }).success).toBe(false);
  });
});
