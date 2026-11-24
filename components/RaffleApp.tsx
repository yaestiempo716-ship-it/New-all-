"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import useSWR from "swr";
import { allNumbers, formatNumber, priceText, raffle, TOTAL_NUMBERS } from "@/lib/config";
import { dictionaries, fill, type Lang } from "@/lib/i18n";
import { maskName } from "@/lib/format";
import type { PublicTicket, Status } from "@/lib/types";

type ListData = { tickets: PublicTicket[]; updatedAt: string };

/* ---------------- language (remembered in this browser) ---------------- */
const LANG_KEY = "rifa-lang";
let memLang: Lang | null = null;
function readLang(): Lang {
  if (memLang) return memLang;
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "es" || v === "en") return v;
  } catch {}
  return raffle.defaultLanguage;
}
function writeLang(l: Lang) {
  memLang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {}
  window.dispatchEvent(new Event(LANG_KEY));
}
function subscribeLang(cb: () => void) {
  window.addEventListener(LANG_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LANG_KEY, cb);
    window.removeEventListener("storage", cb);
  };
}

/* ---------------- data ---------------- */
async function fetcher(url: string): Promise<ListData> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "load_failed");
  return json.data as ListData;
}

const CONFETTI_COLORS = ["#ffc83d", "#ff9f1c", "#2ee59d", "#5aa9ff", "#ff6b7f", "#ffffff"];

export default function RaffleApp({ initial }: { initial: PublicTicket[] | null }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => raffle.defaultLanguage);
  const t = dictionaries[lang];

  const { data, error, isLoading, mutate } = useSWR<ListData>("/api/tickets", fetcher, {
    refreshInterval: raffle.refreshMs,
    revalidateOnFocus: true,
    dedupingInterval: 2000,
    keepPreviousData: true,
    fallbackData: initial ? { tickets: initial, updatedAt: "" } : undefined,
  });

  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<"form" | "success">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<number[]>([]);
  const [popped, setPopped] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [confetti, setConfetti] = useState<{ left: number; delay: number; color: string }[]>([]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Close with Escape + stop the page scrolling behind the dialog
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && setSelected(null);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [selected, saving]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const byNumber = useMemo(() => {
    const m = new Map<number, PublicTicket>();
    data?.tickets.forEach((tk) => m.set(tk.number, tk));
    return m;
  }, [data]);

  const counts = useMemo(() => {
    let taken = 0;
    data?.tickets.forEach((tk) => tk.status !== "available" && taken++);
    return { taken, left: TOTAL_NUMBERS - taken };
  }, [data]);

  const visible = useMemo(() => {
    const q = query.replace(/\D/g, "");
    return allNumbers().filter((n) => {
      const st = byNumber.get(n)?.status ?? "available";
      if (onlyAvailable && st !== "available") return false;
      if (q && !formatNumber(n).includes(q) && !String(n).includes(q)) return false;
      return true;
    });
  }, [byNumber, onlyAvailable, query]);

  const statusLabel = (s: Status) => (s === "available" ? t.available : s === "reserved" ? t.reserved : t.paid);

  function open(n: number) {
    setSelected(n);
    setPhase("form");
    setFormError("");
    setSaving(false);
  }

  function onTile(n: number) {
    const tk = byNumber.get(n);
    if (!tk || tk.status === "available") return open(n);
    setToast(`${formatNumber(n)} · ${tk.name ? fill(t.takenBy, { name: tk.name }) : statusLabel(tk.status)}`);
  }

  function pickRandom() {
    const free = allNumbers().filter((n) => (byNumber.get(n)?.status ?? "available") === "available");
    if (!free.length) return setToast(t.allTaken);
    open(free[Math.floor(Math.random() * free.length)]);
  }

  function burst() {
    setConfetti(
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.45,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    );
    setTimeout(() => setConfetti([]), 2600);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (selected === null || saving) return;
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2 || !/\p{L}/u.test(cleanName)) return setFormError(t.errName);
    if (raffle.askPhone && raffle.requirePhone && !phone.trim()) return setFormError(t.errPhoneReq);

    const number = selected;
    setSaving(true);
    setFormError("");

    // Optimistic: show it as taken right away; the next refresh confirms or corrects it.
    if (data) {
      mutate(
        { ...data, tickets: data.tickets.map((tk) => (tk.number === number ? { ...tk, status: "reserved", name: maskName(cleanName) } : tk)) },
        { revalidate: false },
      );
    }

    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, name: cleanName, phone: raffle.askPhone ? phone : "", website: honeypot }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const code: string = json?.code ?? (res.status === 429 ? "RATE_LIMITED" : "ERR");
        setFormError(
          code === "TAKEN"
            ? t.errTaken
            : code === "RATE_LIMITED"
              ? t.errRate
              : code.startsWith("name_")
                ? t.errName
                : code === "phone_required"
                  ? t.errPhoneReq
                  : code.startsWith("phone_")
                    ? t.errPhone
                    : t.errGeneric,
        );
        mutate(); // roll back to the real data
        return;
      }
      setMine((m) => [...m, number]);
      setPopped(number);
      setPhase("success");
      burst();
      mutate();
    } catch {
      setFormError(t.errGeneric);
      mutate();
    } finally {
      setSaving(false);
    }
  }

  function closeDialog() {
    if (saving) return;
    if (phase === "success") {
      setName("");
      setPhone("");
    }
    setSelected(null);
  }

  const pct = Math.round((counts.taken / TOTAL_NUMBERS) * 100);
  const live = !error;
  const soldOut = data && counts.left === 0;
  const waLink =
    raffle.whatsapp && selected !== null
      ? `https://wa.me/${raffle.whatsapp}?text=${encodeURIComponent(fill(t.whatsappMsg, { n: formatNumber(selected), name: name.trim() }))}`
      : null;

  return (
    <>
      <main className="wrap">
        <div className="topbar">
          <span className={`live${live ? "" : " off"}`}>
            <i aria-hidden="true" />
            {t.live}
          </span>
          <button className="lang" onClick={() => writeLang(lang === "es" ? "en" : "es")} aria-label={t.langSwitch}>
            🌐 {t.langSwitch}
          </button>
        </div>

        <header className="hero">
          <span className="badge">🎟️ {soldOut ? t.soldOut : t.badge}</span>
          <h1>{raffle.title}</h1>
          <p>{raffle.subtitle[lang]}</p>
          <div className="facts">
            <div className="fact">
              <small>{t.prize}</small>
              <b>{raffle.prize[lang]}</b>
            </div>
            <div className="fact">
              <small>{t.perNumber}</small>
              <b>{priceText}</b>
            </div>
            <div className="fact">
              <small>{t.drawDate}</small>
              <b>{raffle.drawDate[lang]}</b>
            </div>
          </div>
        </header>

        <section className="progress" aria-label={`${counts.taken} ${t.of} ${TOTAL_NUMBERS} ${t.taken}`}>
          <div className="row">
            <span>
              <b>{counts.taken}</b> {t.of} {TOTAL_NUMBERS} {t.taken}
            </span>
            <span>{fill(t.left, { n: counts.left })}</span>
          </div>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </section>

        {error && !data && (
          <div className="alert" role="alert">
            <span>{t.loadError}</span>
            <button onClick={() => mutate()}>{t.retry}</button>
          </div>
        )}

        <div className="tools">
          <label className="sr-only" htmlFor="q">
            {t.search}
          </label>
          <input
            id="q"
            className="search"
            type="search"
            inputMode="numeric"
            placeholder={`🔍 ${t.search}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="chip" aria-pressed={onlyAvailable} onClick={() => setOnlyAvailable((v) => !v)}>
            {t.onlyAvailable}
          </button>
        </div>
        <div className="legend" aria-hidden="true">
          <span className="lg-a">{t.available}</span>
          <span className="lg-r">{t.reserved}</span>
          <span className="lg-p">{t.paid}</span>
        </div>

        <div className="grid">
          {!data && (isLoading || !error) &&
            Array.from({ length: Math.min(TOTAL_NUMBERS, 40) }, (_, i) => <div key={i} className="skeleton" />)}
          {data && visible.length === 0 && <p className="empty">{t.noResults}</p>}
          {data &&
            visible.map((n) => {
              const tk = byNumber.get(n);
              const st = tk?.status ?? "available";
              return (
                <button
                  key={n}
                  className={`tile ${st}${mine.includes(n) ? " mine" : ""}${popped === n ? " pop" : ""}`}
                  onClick={() => onTile(n)}
                  aria-disabled={st !== "available"}
                  aria-label={fill(t.numberLabel, { n, status: statusLabel(st) })}
                >
                  {formatNumber(n)}
                  {st !== "available" && tk?.name && <em>{tk.name}</em>}
                </button>
              );
            })}
        </div>

        <section className="steps">
          <h2>{t.howTitle}</h2>
          <div className="step">
            <b>1</b>
            {t.step1}
          </div>
          <div className="step">
            <b>2</b>
            {t.step2}
          </div>
          <div className="step">
            <b>3</b>
            {t.step3}
          </div>
        </section>

        <footer className="foot">
          🎟️ {raffle.title} · {raffle.drawDate[lang]}
        </footer>
      </main>

      {!soldOut && (
        <div className="cta-bar">
          <button className="btn-gold" onClick={pickRandom} disabled={!data}>
            🎯 {t.pickCta}
          </button>
        </div>
      )}

      {selected !== null && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeDialog()}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
            {phase === "form" ? (
              <form onSubmit={submit} noValidate>
                <div className="kicker" id="dlg-title">
                  {t.yourNumber}
                </div>
                <div className="big">{formatNumber(selected)}</div>
                <div className="field">
                  <label htmlFor="f-name">{t.name}</label>
                  <input
                    id="f-name"
                    autoFocus
                    autoComplete="name"
                    maxLength={40}
                    placeholder={t.namePh}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                {raffle.askPhone && (
                  <div className="field">
                    <label htmlFor="f-phone">
                      {t.phone}
                      {raffle.requirePhone ? "" : ` (${t.optional})`}
                    </label>
                    <input
                      id="f-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={25}
                      placeholder={t.phonePh}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                )}
                <input
                  className="hp"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
                <p className="err" role="alert">
                  {formError}
                </p>
                <div className="actions">
                  <button type="button" className="btn" onClick={closeDialog} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="submit" className="btn-gold" disabled={saving}>
                    {saving ? t.saving : `${t.confirm} · ${priceText}`}
                  </button>
                </div>
              </form>
            ) : (
              <div className="success">
                <div className="emoji" aria-hidden="true">
                  🎉
                </div>
                <h2 id="dlg-title">{fill(t.successTitle, { n: formatNumber(selected) })}</h2>
                <p>{fill(t.thanks, { name: name.trim().split(/\s+/)[0] })}</p>
                <div className="pay">💳 {raffle.paymentInstructions[lang]}</div>
                {waLink && (
                  <a className="btn-wa" href={waLink} target="_blank" rel="noopener noreferrer">
                    💬 {t.sendWhatsapp}
                  </a>
                )}
                <button className="btn-gold" style={{ marginTop: 10 }} onClick={closeDialog} autoFocus>
                  {t.done}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {confetti.length > 0 && (
        <div className="confetti" aria-hidden="true">
          {confetti.map((c, i) => (
            <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s` }} />
          ))}
        </div>
      )}
    </>
  );
}
