/**
 * ✏️  RAFFLE SETTINGS — edit this file to change your raffle.
 * Everything the customer sees (title, prize, price, numbers) comes from here.
 */
export const raffle = {
  /** Big title at the top of the page */
  title: "Gran Rifa",
  /** Short line under the title */
  subtitle: { es: "¡Elige tu número de la suerte y gana!", en: "Pick your lucky number and win!" },
  /** What the winner gets */
  prize: { es: "$1,000 en efectivo", en: "$1,000 cash" },
  /** Price of one number */
  price: 10,
  /** Currency symbol shown before prices */
  currency: "$",
  /** Draw date shown to customers */
  drawDate: { es: "24 de diciembre", en: "December 24" },

  /** Numbers available: from `first` to `last` (e.g. 0–99 or 1–100) */
  numbers: { first: 1, last: 100 },

  /** Ask customers for a phone number? */
  askPhone: true,
  /** Make the phone number required? */
  requirePhone: false,

  /**
   * Your WhatsApp number in international format, digits only (e.g. "15551234567").
   * After choosing a number, customers get a button to message you. Leave "" to hide it.
   */
  whatsapp: "",

  /** How to pay — shown after someone picks a number */
  paymentInstructions: {
    es: "Envía tu pago al organizador para confirmar tu número. Tu número queda reservado hasta que se confirme el pago.",
    en: "Send your payment to the organizer to confirm your number. It stays reserved until the payment is confirmed.",
  },

  /** Default language: "es" or "en" (customers can switch) */
  defaultLanguage: "es" as "es" | "en",

  /** Time zone used for the "reserved_at" column */
  timeZone: "America/New_York",

  /** Name of the tab inside your Google Sheet */
  sheetTab: "Tickets",

  /** How often the page checks for changes (milliseconds) */
  refreshMs: 10_000,
} as const;

export const TOTAL_NUMBERS = raffle.numbers.last - raffle.numbers.first + 1;

/** 1 -> "01", 42 -> "42", 100 -> "100" */
export function formatNumber(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatMoney(amount: number): string {
  return `${raffle.currency}${amount.toLocaleString("en-US")}`;
}

export const priceText = formatMoney(raffle.price);

export function allNumbers(): number[] {
  return Array.from({ length: TOTAL_NUMBERS }, (_, i) => raffle.numbers.first + i);
}
