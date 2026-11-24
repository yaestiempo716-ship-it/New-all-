import { z } from "zod";
import { raffle } from "./config";
import { cleanText } from "./format";

const ticketNumber = z
  .number()
  .int()
  .min(raffle.numbers.first)
  .max(raffle.numbers.last);

export const reserveSchema = z.object({
  number: ticketNumber,
  name: z
    .string()
    .max(200)
    .transform((v) => cleanText(v, 40))
    .refine((v) => v.length >= 2, "name_short")
    .refine((v) => /\p{L}/u.test(v), "name_letters"),
  phone: z
    .string()
    .max(60)
    .optional()
    .default("")
    .transform((v) => cleanText(v, 25))
    .refine((v) => v === "" || /^\+?[\d\s().-]{6,25}$/.test(v), "phone_invalid")
    .refine((v) => !raffle.requirePhone || v !== "", "phone_required"),
  /** Honeypot: real people never fill this hidden field. */
  website: z.string().max(200).optional().default(""),
});

export type ReserveInput = z.infer<typeof reserveSchema>;

export const adminUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paid"), number: ticketNumber }),
  z.object({ action: z.literal("reserved"), number: ticketNumber }),
  z.object({ action: z.literal("free"), number: ticketNumber }),
  z.object({
    action: z.literal("edit"),
    number: ticketNumber,
    name: z.string().max(200).transform((v) => cleanText(v, 40)),
    phone: z.string().max(60).optional().default("").transform((v) => cleanText(v, 25)),
  }),
]);

export type AdminUpdate = z.infer<typeof adminUpdateSchema>;

export const loginSchema = z.object({ password: z.string().min(1).max(200) });
