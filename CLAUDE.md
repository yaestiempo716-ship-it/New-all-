# CLAUDE.md — Lottery Number Picker ("Rifa")

## What this project is
A mobile-first website where people choose a raffle number, type their name, and the number becomes **taken for everyone**. The owner sells tickets by sharing one link. **Google Sheets is the database**, with two-way sync: website → sheet (on reserve), sheet → website (polling ~10 s).

The owner is not a developer: explain manual steps (Google Cloud, Vercel) as short numbered steps, and keep `README.md` up to date.

## Stack (do not change without asking)
- **Next.js 16 (App Router) + React 19 + TypeScript (strict)** — deployed on **Vercel**
- **Plain CSS** in `app/globals.css` (CSS variables at `:root`). No Tailwind / UI kits unless asked.
- **`@googleapis/sheets`** with a **Service Account** (JWT)
- **SWR** for client polling, **Zod 4** for validation, **Vitest** for tests
- Package manager: `npm`, Node ≥ 22

## Where things live
```
lib/config.ts        ✏️ ALL raffle settings (title, prize, price, range, WhatsApp, language). Owner edits only this.
lib/sheets.ts        ALL Google Sheets access (google store + in-memory demo store, per-number lock, cache)
lib/validation.ts    Zod schemas (reserve, admin update, login)
lib/format.ts        maskName, cleanText, parseStatus (EN/ES status aliases), nowStamp
lib/auth.ts          admin password check + HMAC-signed httpOnly session cookie
lib/rate-limit.ts    in-memory per-IP limiter
lib/api.ts           JSON helpers, error → friendly response, same-origin check
lib/i18n.ts          ES/EN strings for the public page (admin is English)
components/RaffleApp.tsx   public page (grid, dialog, toast, confetti)
components/AdminApp.tsx    /admin dashboard
app/api/tickets      GET public list (masked names only)
app/api/reserve      POST reserve
app/api/admin/*      login, logout, tickets (full data), update, setup
app/opengraph-image.tsx    WhatsApp/social preview image
tests/               Vitest (Google client faked in tests/sheets.test.ts)
```

## Google Sheet contract (source of truth)
Tab `raffle.sheetTab` (default `Tickets`). Row 1 = headers. One row per number (rows can be in any order).

| A: number | B: name | C: phone | D: status | E: reserved_at | F: note |
|---|---|---|---|---|---|

- `status`: `available` | `reserved` | `paid` (also accepts ES: disponible/reservado/pagado, any case). Blank status + a name = reserved.
- The app writes **only columns B–E of the single row** it changes, with `valueInputOption: "RAW"` (no formula execution). Column F is the owner's.
- Missing rows are appended; `/admin` → "Set up sheet" creates the tab, headers and missing numbers (idempotent).
- Never reorder/delete rows or change columns without asking.

## Environment variables (Vercel + `.env.local`; NEVER commit)
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=     # \n escapes are converted in lib/sheets.ts (privateKeyFromEnv)
GOOGLE_SHEET_ID=
ADMIN_PASSWORD=         # in dev only, "admin" works when empty; in production admin is disabled when empty
```
If the Google vars are missing the app runs in **demo mode** (in-memory, banner in /admin).

## Hard rules
1. **No double-booking.** Reserve = per-number lock → fresh read (bypass cache) → write only if available → `409 TAKEN`. Never trust client state.
2. **Server-only secrets.** `lib/sheets.ts`, `lib/auth.ts`, `lib/api.ts` import `server-only`. Nothing sensitive in client bundles.
3. **Validate everything** with Zod; clean text with `cleanText`; cap sizes (`readJson` 4 KB).
4. **Abuse protection:** rate limits (reserve 6/min + 30/h per IP, login 8/15 min), honeypot field `website`, same-origin check on POSTs.
5. **Sheets quota:** 5 s server cache + shared in-flight read; client polls every `raffle.refreshMs` and on focus.
6. **Privacy:** public API returns only `number`, `status`, masked name. Phones/notes only via `/api/admin/*` (session checked server-side in each route).
7. Optimistic UI must roll back (re-fetch) on error. Friendly errors, never a blank page.
8. Accessibility: aria-labels on tiles, focus rings, Esc closes dialog, `prefers-reduced-motion`, works at 360 px.

## Workflow rules for Claude
- Plan first for changes touching more than 2 files; then implement.
- Before saying "done": `npm run lint && npm run typecheck && npm test && npm run build` must pass. For UI changes, also check the page in Playwright at 390 px and 1280 px.
- Ask before: adding dependencies, paid services, changing sheet columns, or deploying/pushing to the production branch.
- Never print or commit secrets. If one is needed, tell the owner exactly where to set it in Vercel.
- Update `README.md` when behavior or setup changes.

## Commands
```
npm run dev | build | start | lint | typecheck | test
```
