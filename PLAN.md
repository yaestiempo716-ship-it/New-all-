# PLAN — Lottery Website (Vercel + Google Sheets)

> **Status:** Phases 0–6 are built and tested (see `README.md`). Remaining: Phase 7 — the owner connects Google + Vercel (README steps 2–4).
> Stack changed slightly from the first draft: Next.js 16 and plain CSS instead of Tailwind/Framer Motion (fewer moving parts).

## 1. Do you need a lot of agents?
**No.** This is a small, well-defined app. Use **one main Claude Code session** that builds it phase by phase, following `CLAUDE.md`. More agents = more cost and more chances of inconsistent code.

Use extra agents only in two places (optional, both cheap):
| When | Agent | Why |
|---|---|---|
| After Phase 3 | **Reviewer** (`/code-review` or a subagent) | Fresh eyes on double-booking, security, secrets |
| After Phase 5 | **Tester** (Playwright subagent) | Simulates two people picking the same number at once |

Everything else (design, API, sheets, deploy) = the single main session.

## 2. How the system works
```
Customer phone ──► Vercel (Next.js site + API routes) ──► Google Sheets API ──► Your Google Sheet
        ▲                         │                                                    │
        └──── polls every ~10s ◄──┴──────────── reads sheet (cached 5–10s) ◄───────────┘
```
- Customer picks number → API checks the row is still free → writes name + status to the sheet.
- You edit the sheet (mark paid, free a number) → the site shows it in ≤10 seconds. No webhook needed; polling is simple and reliable.
- Why not "instant" push? Sheets has no realtime push; 10-second polling is invisible to users and keeps you inside Google's free quota.

## 3. Steps YOU do manually (Claude will guide you, but only you can click these)
1. **Create the Google Sheet** named e.g. "Rifa". Tab `Tickets`. Row 1 headers: `number | name | phone | status | reserved_at | note`. Pre-fill column A with 1..100 (or your range) and `available` in column D.
2. **Google Cloud project** → enable **Google Sheets API** → create a **Service Account** → create a **JSON key**.
3. **Share the sheet** with the service account email (Editor).
4. **GitHub**: this repo already exists (`New-all-`).
5. **Vercel**: Import the GitHub repo → add the 4 environment variables → deploy.
6. (Optional) Buy/connect a custom domain in Vercel.

## 4. Phases (give Claude Code ONE phase at a time)
| Phase | Goal | Done when |
|---|---|---|
| 0 | Project setup: Next.js, Tailwind, lint, folders, `.env.example`, `lib/config.ts` | `npm run dev` shows a placeholder page |
| 1 | Google Sheets layer (`lib/sheets.ts`) + `GET /api/tickets` | Real sheet data shows as JSON |
| 2 | Public UI with number grid, progress, polling (read-only) | Grid mirrors the sheet; edit sheet → grid updates |
| 3 | Reserve flow: modal, validation, `POST /api/reserve`, anti-double-booking, rate limit | Two browsers can't take the same number |
| 4 | Admin page: login, mark paid, free, export CSV, draw winner | You can run the whole raffle without opening the sheet |
| 5 | Design polish, animations, i18n, OG share image, accessibility | Looks premium on a phone; Lighthouse targets met |
| 6 | Tests + review + hardening | Tests green; reviewer finds no critical issues |
| 7 | Deploy to Vercel + custom domain + final checklist | Live link works from WhatsApp |

## 5. Prompts to give Claude Code (copy/paste in order)

### 5.0 Kickoff (paste first, once)
```
Read CLAUDE.md and PLAN.md fully. You are my senior full-stack engineer.
I am NOT a developer, so explain manual steps simply and numbered.
We will work phase by phase. Do NOT start coding yet.
First, confirm you understood the project in 8 bullet points, list any
questions you need answered (raffle name, number range, price per number,
prize, draw date, language, colors/brand), and wait for my answers.
```

### 5.1 Phase 0 — Setup
```
Phase 0. Initialize a Next.js (App Router) + TypeScript + Tailwind project in
this repo root, following the structure in CLAUDE.md. Add: .gitignore with
.env*, .env.example, lib/config.ts with my raffle settings, ESLint, Prettier,
Vitest, and npm scripts (dev, build, lint, typecheck, test). Show a simple
placeholder home page. When done, tell me how to run it and what you verified.
```

### 5.2 Phase 1 — Google Sheets
```
Phase 1. Implement lib/sheets.ts using googleapis with a service account from
env vars (handle the \n in GOOGLE_PRIVATE_KEY). Functions: getTickets(),
reserveTicket(number, name, phone?), setStatus(number, status), freeTicket(number).
Add a 5–10s server cache for reads. reserveTicket must re-read the row right
before writing and fail with a typed "TAKEN" error if it is no longer available.
Sanitize values against formula injection. Create GET /api/tickets returning
masked names only. Write unit tests with the Google client mocked.
Then give me numbered, beginner-friendly steps to create the service account,
share the sheet, and fill .env.local, and tell me how to test it.
```

### 5.3 Phase 2 — Public grid (read-only)
```
Phase 2. Build the public page: header (title, prize, price, date), progress
bar, and a responsive grid of numbers using the data from /api/tickets with SWR
(refresh every 10s + on focus). States: available / reserved / paid. Mobile-first,
44px+ tap targets, aria-labels. Add loading skeletons and an error state with
retry. Do not build the reserve flow yet. Tell me how to verify that editing the
Google Sheet updates the grid.
```

### 5.4 Phase 3 — Reserve flow
```
Phase 3. Implement the reserve flow. Tapping an available number opens a modal
(bottom sheet on mobile) with name (and optional phone), Zod validation, a
honeypot field, and a confirm button with loading state. POST /api/reserve with
IP rate limiting. On success: confetti + the tile turns taken instantly (optimistic,
rollback on error). If someone else took it first: friendly 409 message and the
grid refreshes. Add a Vitest test for the race condition and a Playwright test:
pick a number, reload, it is taken.
```

### 5.5 Phase 4 — Admin
```
Phase 4. Build /admin protected by ADMIN_PASSWORD (signed httpOnly cookie,
rate-limited login, logout). Features: full table with search, mark paid,
free number, edit name, export CSV, button to open the Google Sheet, and a
"Draw winner" animation that picks randomly among PAID numbers and shows the
result full-screen. All admin APIs must verify the session server-side.
```

### 5.6 Phase 5 — Design polish ("super website")
```
Phase 5. Make the design premium and festive but clean: cohesive color system
(CSS variables), refined typography (next/font), glow on available numbers,
smooth Framer Motion transitions (respect prefers-reduced-motion), a hero
section with the prize, trust elements (how it works in 3 steps, rules),
a sticky "Pick a number" CTA on mobile, ES/EN toggle via lib/i18n.ts,
dynamic Open Graph image for WhatsApp previews, favicon, and a footer with
my contact. Test at 360px, 390px, 768px, 1280px using Playwright screenshots
and fix any visual problem. Run Lighthouse and report scores.
```

### 5.7 Phase 6 — Review and hardening
```
Phase 6. Act as a strict security and QA reviewer of this codebase. Check:
double-booking, formula injection, secret leakage to the client, rate limiting,
admin auth bypass, Sheets quota behavior, error handling, accessibility.
List findings by severity, fix the critical and high ones, add tests for each
fix, then run lint, typecheck, tests and build and show me the results.
```

### 5.8 Phase 7 — Deploy
```
Phase 7. Prepare for production on Vercel. Give me a numbered, beginner-friendly
checklist to: import the GitHub repo, set the 4 environment variables
(explain how to paste GOOGLE_PRIVATE_KEY correctly), deploy, connect a custom
domain, and test on my phone. Add a README with setup, how to change raffle
settings in lib/config.ts, and how to reset the raffle for a new round.
Do not deploy or push to main without asking me.
```

## 6. Optional "master prompt" if you prefer ONE shot after the kickoff
```
Following CLAUDE.md and PLAN.md, execute Phases 0 through 3 in order. After each
phase, run lint/typecheck/tests, commit with a clear message, and give a 5-line
report. Stop and ask me whenever you need a credential or a decision. Do not
proceed to Phase 4 until I say so.
```

## 7. Decisions you should make before starting
- Number range (1–100? 00–99? 1–500?) and price per number
- Reservation flow: **instant "taken"** (recommended) vs. "reserved until paid" with auto-release after X hours
- Do you collect phone numbers? (useful to contact winners)
- Payment: manual (you mark paid in the sheet/admin) — recommended for v1. Online payments (Stripe/PayPal) can be v2.
- Language(s) and brand colors/logo
- Legal note: raffle/lottery rules differ by country/state — check local regulations before selling tickets.

## 8. Risks and how the plan handles them
| Risk | Mitigation |
|---|---|
| Two people pick the same number | Re-read row before write, 409 on conflict, tested |
| Google quota (60 reads/min) | Server cache 5–10s + 10s polling |
| Spam/bots | Rate limit + honeypot |
| Leaked Google key | Env vars only, server-side only, `.env*` ignored |
| Someone edits sheet wrongly | Column contract in CLAUDE.md; app tolerates blank/invalid rows |
| Personal data exposure | Public API returns masked names only |
