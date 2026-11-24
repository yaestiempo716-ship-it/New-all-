# 🎟️ Rifa — Raffle Number Picker

People open your link, tap a number, type their name — and that number is instantly taken for everyone.
Your **Google Sheet is the database**: every pick appears there, and anything you change in the sheet appears on the site within ~10 seconds.

- **Customer page** `/` — number grid, search, "random number" button, Spanish/English, confetti, WhatsApp button.
- **Admin page** `/admin` — password protected: mark paid / unpaid, edit, free a number, export CSV, copy link, **draw a winner**.
- **Safe**: no double-booking, Google key never reaches the browser, bot/spam protection, names masked in public ("Maria G.").
- **Works before Google is connected** ("Demo mode") so you can try everything first.

---

## ✏️ 1. Change your raffle details

Open **`lib/config.ts`** and edit: title, prize, price, draw date, number range (e.g. 1–100), your WhatsApp number, payment instructions, language.
That's the only file you need to touch.

---

## 📗 2. Create the Google Sheet (5 min)

1. Go to <https://sheets.new> and name the file, e.g. **Rifa**.
2. Copy the sheet ID from the address bar:
   `https://docs.google.com/spreadsheets/d/`**`THIS_LONG_PART`**`/edit` → this is your **GOOGLE_SHEET_ID**.

> You don't have to type the columns or the numbers. After connecting, press **"Set up sheet"** in `/admin` and the site creates the `Tickets` tab, the headers and one row per number for you.

The columns are: `number | name | phone | status | reserved_at | note`
`status` can be `available`, `reserved` or `paid` (Spanish also works: `disponible`, `reservado`, `pagado`). Column **F (note)** is yours — the site never overwrites it.

---

## 🔑 3. Create the Google "robot" account (service account) — 10 min

This lets the website edit your sheet without your Google password.

1. Open <https://console.cloud.google.com/> → top bar **Select a project → New project** → name it `rifa` → **Create**.
2. Open <https://console.cloud.google.com/apis/library/sheets.googleapis.com> → make sure the `rifa` project is selected → **Enable**.
3. Open <https://console.cloud.google.com/iam-admin/serviceaccounts> → **Create service account** → name `rifa-bot` → **Create and continue** → skip roles → **Done**.
4. Click the new account → tab **Keys** → **Add key → Create new key → JSON → Create**. A `.json` file downloads. **Keep it private. Never upload it to GitHub.**
5. Open that JSON file with a text editor (Notepad / TextEdit). You need two values:
   - `client_email` → this is **GOOGLE_SERVICE_ACCOUNT_EMAIL** (looks like `rifa-bot@rifa-12345.iam.gserviceaccount.com`)
   - `private_key` → this is **GOOGLE_PRIVATE_KEY** (starts with `-----BEGIN PRIVATE KEY-----`)
6. Back in your Google Sheet → **Share** → paste the `client_email` → role **Editor** → untick "Notify" → **Share**.

---

## ▲ 4. Put it online with Vercel — 10 min

1. Go to <https://vercel.com/signup> → **Continue with GitHub**.
2. **Add New… → Project** → find the `New-all-` repository → **Import**.
3. Open **Environment Variables** and add these 4 (name → value):

   | Name | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON |
   | `GOOGLE_PRIVATE_KEY` | the whole `private_key` value from the JSON, **including** `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----\n`. Copy it exactly as it is in the file (with the `\n` parts). |
   | `GOOGLE_SHEET_ID` | the ID from step 2 |
   | `ADMIN_PASSWORD` | a long password only you know |

4. Click **Deploy**. After ~1 minute you get a link like `https://new-all-xxxx.vercel.app`.
5. Open `https://YOUR-LINK/admin` → log in → press **🧰 Set up sheet** → check your Google Sheet: the numbers are there. ✅
6. Press **🔗 Copy raffle link** and send it on WhatsApp. 🎉

**Which branch goes live?** Vercel publishes your repository's *default branch*. If the site doesn't show the raffle, go to Vercel → Project → **Settings → Environments → Production → Branch** and choose the branch that has this code (or merge it into your default branch on GitHub).

**Changed an environment variable later?** Vercel → **Deployments** → ⋯ on the latest → **Redeploy**.

**Custom domain (optional):** Vercel → Project → **Settings → Domains → Add**, and follow the instructions.

---

## 🧑‍💼 Running the raffle day to day

| You want to… | Do this |
|---|---|
| Confirm someone paid | `/admin` → **✅ Paid** (or type `paid` in the sheet) |
| Free a number (didn't pay) | `/admin` → **🗑 Free** (or clear the name and type `available` in the sheet) |
| Add a sale you made in person | `/admin` → filter **available** → **✏️ Assign** (or type the name in the sheet) |
| See who still owes | `/admin` → filter **unpaid** — tap the phone number to open WhatsApp |
| Pick the winner | `/admin` → **🏆 Draw winner** (only among **paid** numbers) |
| Start a new raffle | Make a new Google Sheet, change `GOOGLE_SHEET_ID` in Vercel, redeploy, press **Set up sheet** |

---

## 🧯 If something goes wrong

The admin page shows a 💡 hint for most problems:

| Message | Fix |
|---|---|
| **Demo mode** | The Google variables are missing in Vercel. Add them and **Redeploy**. |
| **No permission to the Google Sheet** | Share the sheet with the `client_email` as **Editor**. |
| **Google Sheet not found** | `GOOGLE_SHEET_ID` is wrong — copy it again from the sheet address. |
| **Google key is invalid** | Re-paste `GOOGLE_PRIVATE_KEY` exactly as in the JSON file, then Redeploy. |
| **Tab "Tickets" not found** | Press **Set up sheet** in `/admin`. |
| **Google Sheets is busy** | Too many requests in a minute — it recovers by itself. |

---

## 👩‍💻 For developers

```bash
npm install
cp .env.example .env.local   # leave Google values empty for demo mode
npm run dev                  # http://localhost:3000  (admin password in dev: "admin" if ADMIN_PASSWORD is empty)
npm run lint && npm run typecheck && npm test && npm run build
```

Stack: Next.js 16 (App Router) · React 19 · TypeScript · SWR · Zod · `@googleapis/sheets` · Vitest. Plain CSS (`app/globals.css`).
All Google access is in `lib/sheets.ts`. Project rules for Claude Code are in `CLAUDE.md`.

**How double-booking is prevented:** the server re-reads the number's row from Google right before writing, writes only if it is still available (one row, columns B–E, `RAW` so nothing is ever interpreted as a formula), and serializes writes to the same number. Google Sheets has no transactions, so two different Vercel servers writing in the *same split second* is theoretically possible; for a raffle this is extremely unlikely, and `/admin` always shows the truth from the sheet.
