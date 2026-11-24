# CLAUDE.md — Lottery Number Picker ("Rifa")

## What this project is
A mobile-first website where people choose a lottery/raffle number (e.g. 00–99 or 1–100), type their name, and the number becomes **taken for everyone**. The owner sells tickets by sharing one link. **Google Sheets is the database**, with two-way sync: website → sheet, and sheet → website.

## Stack (do not change without asking)
- **Next.js (App Router) + TypeScript** — deployed on **Vercel**
- **Tailwind CSS** (+ shadcn/ui only if needed), **Framer Motion** for small animations
- **Google Sheets API** via the `googleapis` package, using a **Service Account**
- **SWR** for client polling, **Zod** for validation
- Package manager: `npm`

## Google Sheet contract (source of truth)
Sheet tab name: `Tickets`. Row 1 = headers. One row per number.

| A: number | B: name | C: phone (optional) | D: status | E: reserved_at | F: note |
|---|---|---|---|---|---|

- `status` ∈ `available` | `reserved` | `paid`  (empty `name` + empty status = available)
- The owner may edit the sheet by hand at any time (mark paid, free a number, rename). The site must reflect it within ~10 seconds.
- Never reorder, delete, or rewrite rows/columns the app does not own. Only write to the single row for the chosen number.

## Environment variables (Vercel + `.env.local`; NEVER commit)
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=          # keep \n escapes; replace with real newlines in code
GOOGLE_SHEET_ID=
ADMIN_PASSWORD=
```
Always keep `.env*` in `.gitignore`. Provide `.env.example` with empty values.

## Hard rules (the site must be bulletproof)
1. **No double-booking.** Reserve = re-read the row immediately before writing; write only if still available; return `409` with a friendly message if taken. Use a single conditional update, never trust client state.
2. **Server-only secrets.** Google credentials are used only in `app/api/*` route handlers / server code. Nothing sensitive reaches the browser.
3. **Validate everything** with Zod: number in range, name 2–40 chars, trimmed, strip control chars, block formula injection (cell values starting with `= + - @` get a leading `'`).
4. **Rate-limit** the reserve endpoint (per IP) and add a hidden honeypot field to stop bots.
5. **Respect Sheets quota** (~60 reads/min/user): cache the sheet read server-side for 5–10 s (`unstable_cache`/in-memory with TTL) and poll from the client every 10 s with SWR; also refetch on tab focus.
6. **Privacy:** the public API returns only `number`, `status`, and a **masked name** (e.g. "Maria G.") — never phone or notes. Full data only in `/admin`.
7. **Never leave the UI lying:** optimistic UI is allowed, but must roll back on error.
8. Handle errors gracefully: sheet down, quota hit, network lost → friendly message + retry, never a blank page.

## Features
**Public (`/`)**
- Header with raffle title, prize, draw date, price per number, progress bar ("37/100 taken").
- Grid of numbers: available (clickable), reserved, paid/taken (disabled, shows masked name on tap/hover).
- Tap number → modal/bottom sheet: selected number, name input (+ optional phone), confirm button, success confetti, clear error states.
- Search/jump to a number, filter "available only".
- Shareable link with nice OG image/preview (WhatsApp/Instagram look good).

**Admin (`/admin`, password-protected, cookie session via signed httpOnly cookie)**
- Full table, mark paid / free number / edit name, export CSV, "Draw winner" random picker among paid numbers (with animation).
- Link to open the Google Sheet.

## Design direction
- Premium, festive-but-clean look: dark or warm-gold accent theme, large rounded tiles, soft shadows, subtle glow on available numbers, smooth micro-animations.
- **Mobile-first** (most users open it from WhatsApp). Touch targets ≥ 44px. Works at 360px width.
- Accessible: contrast AA, focus rings, `aria-label` on each number ("Number 17, available"), keyboard navigable, `prefers-reduced-motion` respected.
- Language: Spanish and English toggle (default Spanish) unless told otherwise. All strings in one `lib/i18n.ts`.
- Lighthouse target: Performance ≥ 90, Accessibility ≥ 95.

## Project structure
```
app/
  page.tsx                  # public grid
  admin/page.tsx            # admin
  api/tickets/route.ts      # GET list (masked)
  api/reserve/route.ts      # POST reserve
  api/admin/*/route.ts      # login, mark paid, free, draw
components/                 # NumberGrid, NumberTile, ReserveModal, ProgressBar, ...
lib/sheets.ts               # ALL Google Sheets access lives here only
lib/validation.ts           # Zod schemas
lib/rate-limit.ts
lib/i18n.ts
lib/config.ts               # raffle title, price, range, date (single place to edit)
```

## Code conventions
- TypeScript strict, no `any`. Small components, server logic in `lib/`.
- Every API route: validate input → do work → typed JSON response `{ ok, data?, error? }`.
- Config (range, price, title, prize) lives in `lib/config.ts`, not hardcoded in components.
- Write unit tests (Vitest) for `lib/sheets.ts` logic with the Google client mocked, validation, and masking. Add one Playwright test: pick a number → it appears taken after reload.
- Commit small, meaningful commits. Run `npm run lint && npm run typecheck && npm test` before saying "done".

## Workflow rules for Claude
- Plan first for any change touching more than 2 files; show the plan, then implement.
- Do one phase at a time (see `PLAN.md`); stop at the end of each phase and report what works + how to verify.
- Ask me before: adding paid services, changing the sheet columns, adding dependencies that are not listed above, or deploying.
- Never print or commit secrets. If a secret is needed, tell me the exact step to set it in Vercel.
- Explain anything I must do manually (Google Cloud, Vercel dashboard) as numbered steps for a non-developer.

## Commands
```
npm run dev        # local
npm run build      # production build
npm run lint
npm run typecheck
npm test
```
