"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatMoney, formatNumber, raffle } from "@/lib/config";
import type { Status, Ticket } from "@/lib/types";

type AdminData = { tickets: Ticket[]; mode: "google" | "demo"; sheetUrl: string | null; serviceAccount: string | null };
type Filter = "taken" | "reserved" | "paid" | "available" | "all";

class HttpError extends Error {
  constructor(public status: number, message: string, public hint?: string) {
    super(message);
  }
}

async function fetcher(url: string): Promise<AdminData> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new HttpError(res.status, json?.error ?? "Error", json?.hint);
  return json.data as AdminData;
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new HttpError(res.status, json?.error ?? "Error", json?.hint);
  return json.data;
}

/** Protect against spreadsheet formula injection when the CSV is opened in Excel. */
function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export default function AdminApp() {
  const { data, error, mutate, isLoading } = useSWR<AdminData>("/api/admin/tickets", fetcher, {
    refreshInterval: raffle.refreshMs,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [filter, setFilter] = useState<Filter>("taken");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ number: number; name: string; phone: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string; hint?: string } | null>(null);
  const [winner, setWinner] = useState<{ num: string; name: string; rolling: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const unauthorized = error instanceof HttpError && error.status === 401;

  const stats = useMemo(() => {
    const t = data?.tickets ?? [];
    const paid = t.filter((x) => x.status === "paid").length;
    const reserved = t.filter((x) => x.status === "reserved").length;
    return { paid, reserved, taken: paid + reserved, available: t.length - paid - reserved, money: paid * raffle.price };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.tickets ?? []).filter((t) => {
      if (filter === "taken" && t.status === "available") return false;
      if (filter !== "taken" && filter !== "all" && t.status !== filter) return false;
      if (!q) return true;
      return (
        String(t.number).includes(q) || formatNumber(t.number).includes(q) || t.name.toLowerCase().includes(q) || t.phone.includes(q)
      );
    });
  }, [data, filter, query]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      await post("/api/admin/login", { password });
      setPassword("");
      await mutate();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    await post("/api/admin/logout").catch(() => null);
    await mutate(undefined, { revalidate: true });
  }

  async function change(body: { action: "paid" | "reserved" | "free" } | { action: "edit"; name: string; phone: string }, number: number) {
    setBusy(number);
    setMessage(null);
    try {
      await post("/api/admin/update", { ...body, number });
      await mutate();
      return true;
    } catch (err) {
      const e = err as HttpError;
      setMessage({ kind: "bad", text: e.message, hint: e.hint });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function setupSheet() {
    setMessage(null);
    try {
      const r = (await post("/api/admin/setup")) as { added: number };
      setMessage({ kind: "good", text: r.added ? `Sheet ready — added ${r.added} numbers.` : "Sheet is already set up. 👍" });
      await mutate();
    } catch (err) {
      const e = err as HttpError;
      setMessage({ kind: "bad", text: e.message, hint: e.hint });
    }
  }

  function exportCsv() {
    const header = ["number", "name", "phone", "status", "reserved_at", "note"];
    const lines = (data?.tickets ?? [])
      .filter((t) => t.status !== "available")
      .map((t) => [formatNumber(t.number), t.name, t.phone, t.status, t.reservedAt, t.note].map(csvCell).join(","));
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rifa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", window.location.origin);
    }
  }

  function draw() {
    const paid = (data?.tickets ?? []).filter((t) => t.status === "paid");
    if (!paid.length) {
      setMessage({ kind: "bad", text: "No PAID numbers yet. Mark numbers as paid before drawing." });
      return;
    }
    const pick = () => paid[Math.floor(Math.random() * paid.length)];
    let i = 0;
    setWinner({ num: formatNumber(pick().number), name: "", rolling: true });
    const id = setInterval(() => {
      i++;
      if (i < 30) {
        setWinner({ num: formatNumber(pick().number), name: "", rolling: true });
      } else {
        clearInterval(id);
        const w = pick();
        setWinner({ num: formatNumber(w.number), name: w.name, rolling: false });
      }
    }, 90);
  }

  /* ---------------- login screen ---------------- */
  if (unauthorized || (!data && error instanceof HttpError && error.status === 401)) {
    return (
      <main className="admin">
        <form className="card login-card" onSubmit={login}>
          <div style={{ fontSize: 44 }} aria-hidden="true">
            🔐
          </div>
          <h1 style={{ justifyContent: "center" }}>Admin</h1>
          <label className="sr-only" htmlFor="pw">
            Password
          </label>
          <input id="pw" type="password" autoFocus autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-gold" disabled={loggingIn || !password}>
            {loggingIn ? "…" : "Log in"}
          </button>
          <p className="err" role="alert">
            {loginError}
          </p>
          <p style={{ color: "var(--mute)", fontSize: 13 }}>
            <Link href="/" style={{ color: "var(--gold)" }}>
              ← Back to the raffle
            </Link>
          </p>
        </form>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="admin">
        {isLoading && <p style={{ color: "var(--mute)" }}>Loading…</p>}
        {error && (
          <div className="notice bad" role="alert">
            <b>{error.message}</b>
            {(error as HttpError).hint && <div style={{ marginTop: 6 }}>💡 {(error as HttpError).hint}</div>}
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="mini" onClick={() => mutate()}>
                Retry
              </button>
              <button className="mini" onClick={setupSheet}>
                Set up sheet
              </button>
              <button className="mini" onClick={logout}>
                Log out
              </button>
            </div>
            {message && <div style={{ marginTop: 10 }}>{message.text} {message.hint && `— ${message.hint}`}</div>}
          </div>
        )}
      </main>
    );
  }

  /* ---------------- dashboard ---------------- */
  return (
    <main className="admin">
      <header>
        <h1>
          🎟️ {raffle.title}
          <span className={`pill ${data.mode}`}>{data.mode === "google" ? "● Google Sheets connected" : "Demo mode"}</span>
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="mini" href="/" target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
            View site ↗
          </a>
          <button className="mini" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {data.mode === "demo" && (
        <div className="notice warn">
          <b>Demo mode:</b> Google Sheets is not connected yet, so changes are kept in memory and will be lost. Add{" "}
          <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>, <code>GOOGLE_PRIVATE_KEY</code> and <code>GOOGLE_SHEET_ID</code> in Vercel → Settings →
          Environment Variables, then redeploy. See README.md for the step-by-step guide.
        </div>
      )}

      {message && (
        <div className={`notice ${message.kind}`} role="status">
          {message.text}
          {message.hint && <div style={{ marginTop: 4 }}>💡 {message.hint}</div>}
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <small>Taken</small>
          <b>
            {stats.taken}
            <span style={{ fontSize: 14, color: "var(--mute)" }}> / {data.tickets.length}</span>
          </b>
        </div>
        <div className="stat">
          <small>Paid</small>
          <b style={{ color: "var(--green)" }}>{stats.paid}</b>
        </div>
        <div className="stat">
          <small>Waiting for payment</small>
          <b style={{ color: "var(--orange)" }}>{stats.reserved}</b>
        </div>
        <div className="stat">
          <small>Money collected</small>
          <b style={{ color: "var(--gold)" }}>{formatMoney(stats.money)}</b>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn-gold" onClick={draw}>
          🏆 Draw winner
        </button>
        <button className="btn" onClick={copyLink}>
          {copied ? "✅ Copied!" : "🔗 Copy raffle link"}
        </button>
        <button className="btn" onClick={exportCsv}>
          ⬇️ Export CSV
        </button>
        {data.sheetUrl && (
          <a className="btn" href={data.sheetUrl} target="_blank" rel="noreferrer">
            📗 Open Google Sheet
          </a>
        )}
        {data.mode === "google" && (
          <button className="btn" onClick={setupSheet} title="Creates the tab, headers and missing numbers. Safe to run again.">
            🧰 Set up sheet
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter">
          {(["taken", "reserved", "paid", "available", "all"] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "reserved" ? "unpaid" : f}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Search number, name or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Reserved at</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--mute)" }}>
                  Nothing here yet.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const isEditing = editing?.number === t.number;
              const disabled = busy === t.number;
              return (
                <tr key={t.number}>
                  <td>
                    <b>{formatNumber(t.number)}</b>
                  </td>
                  <td>
                    {isEditing ? (
                      <input aria-label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    ) : (
                      t.name || <span style={{ color: "var(--mute)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input aria-label="Phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                    ) : t.phone ? (
                      <a href={`https://wa.me/${t.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                        {t.phone}
                      </a>
                    ) : (
                      <span style={{ color: "var(--mute)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`tag ${t.status}`}>{label(t.status)}</span>
                  </td>
                  <td style={{ color: "var(--mute)" }}>{t.reservedAt || "—"}</td>
                  <td>
                    {isEditing ? (
                      <>
                        <button
                          className="mini"
                          disabled={disabled}
                          onClick={async () => {
                            if (await change({ action: "edit", name: editing.name, phone: editing.phone }, t.number)) setEditing(null);
                          }}
                        >
                          💾 Save
                        </button>
                        <button className="mini" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {t.status !== "paid" && t.status !== "available" && (
                          <button className="mini" disabled={disabled} onClick={() => change({ action: "paid" }, t.number)}>
                            ✅ Paid
                          </button>
                        )}
                        {t.status === "paid" && (
                          <button className="mini" disabled={disabled} onClick={() => change({ action: "reserved" }, t.number)}>
                            ↩ Unpaid
                          </button>
                        )}
                        <button className="mini" disabled={disabled} onClick={() => setEditing({ number: t.number, name: t.name, phone: t.phone })}>
                          ✏️ {t.status === "available" ? "Assign" : "Edit"}
                        </button>
                        {t.status !== "available" && (
                          <button
                            className="mini"
                            disabled={disabled}
                            onClick={() => window.confirm(`Free number ${formatNumber(t.number)} (${t.name})?`) && change({ action: "free" }, t.number)}
                          >
                            🗑 Free
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--mute)", fontSize: 13, marginTop: 10 }}>
        Tip: you can also edit the Google Sheet directly — type <b>paid</b>, <b>reserved</b> or <b>available</b> in the status column (Spanish works too:
        pagado, reservado, disponible). The site updates within ~10 seconds.
      </p>

      {winner && (
        <div className="winner" role="dialog" aria-modal="true" aria-label="Winner">
          <div>
            <h2>🏆 WINNING NUMBER</h2>
            <div className="num">{winner.num}</div>
            <p>{winner.rolling ? "…" : `🎉 ${winner.name}`}</p>
            {!winner.rolling && (
              <button className="btn-gold" style={{ width: "auto", padding: "14px 34px" }} onClick={() => setWinner(null)}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function label(s: Status) {
  return s === "available" ? "available" : s === "reserved" ? "unpaid" : "paid";
}
