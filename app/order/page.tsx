"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Call, PoolView, Quote } from "@/lib/contracts";
import { VENDORS, listPriceFor } from "@/lib/vendors";
import { effectiveFor, poolFacts } from "@/components/negotiation/derive";

const CATEGORY = "soc2_compliance";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function closesIn(nowIso: string, closesAtIso: string): string {
  const ms = new Date(closesAtIso).getTime() - new Date(nowIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "closed";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h - d * 24}h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type QuoteRow = {
  id: string;
  name: string;
  listCents: number;
  poolCents: number | null;
  live: boolean;
  status: string;
};

function rowsFor(view: PoolView, vendorId: string | null): QuoteRow[] {
  const ids = new Set(view.pool.memberOrderIds);
  const members = view.orders.filter((o) => ids.has(o.id));
  const at = new Date(view.now);
  const vendors = VENDORS.filter((v) => v.category === CATEGORY && (!vendorId || v.id === vendorId));
  return vendors.map((v) => {
    const call: Call | null = [...view.calls].filter((c) => c.vendorId === v.id).sort((a, b) => b.sequence - a.sequence)[0] ?? null;
    const quote: Quote | null = call ? (view.quotes.find((q) => q.callId === call.id) ?? null) : null;
    const eff = quote ? effectiveFor(quote, members, at) : null;
    let status = "Not called yet";
    let live = false;
    if (call?.status === "queued" || call?.status === "in_progress") {
      status = "On the phone now";
      live = true;
    } else if (quote) {
      status = quote.separateAccountsConfirmed === false ? "Quoted, shared account only" : quote.perAccountFeeCents > 0 ? `Quoted, ${usd(quote.perAccountFeeCents)} account fee` : "Quoted, separate accounts";
      if (!eff) status = "Quoted, no tier at this pool size";
    } else if (call?.status === "ended" || call?.status === "transcribed") {
      status = "Call ended, reading the quote";
    } else if (call?.status === "extracted") {
      status = "Call ended, no quote";
    } else if (call?.status === "failed") {
      status = "Call failed";
    }
    return { id: v.id, name: v.name, listCents: v.listPricePerSeatCents, poolCents: eff?.tierCents ?? null, live, status };
  });
}

function usePool(intervalMs = 3000): PoolView | null {
  const [view, setView] = useState<PoolView | null>(null);
  useEffect(() => {
    let stop = false;
    let busy = false;
    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/pool", { cache: "no-store" });
        if (!res.ok) return;
        const v = (await res.json()) as PoolView;
        if (!stop) setView(v);
      } catch {
        /* keep last good view */
      } finally {
        busy = false;
      }
    }
    void tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [intervalMs]);
  return view;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const fieldCls = "h-[42px] w-full rounded-md border border-[#cfd5db] bg-surface px-3 text-[15px] text-ink focus:border-accent focus:outline-2 focus:outline-offset-1 focus:outline-accent";
const stepCls = "h-10 w-10 cursor-pointer rounded-md border border-[#cfd5db] bg-surface text-lg text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40";
const rowCls = "grid grid-cols-[minmax(0,1.2fr)_90px_110px_minmax(0,1fr)] items-baseline gap-3 py-2.5 text-sm";

function OrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const vendor = useMemo(() => VENDORS.find((v) => v.id === params.get("vendor") && v.category === CATEGORY) ?? null, [params]);
  const vendorId = vendor?.id ?? null;
  const listCents = listPriceFor(CATEGORY, vendorId);

  const [idempotencyKey] = useState(() => crypto.randomUUID()); // once per mount
  const [seats, setSeats] = useState(() => {
    const n = Math.floor(Number(params.get("seats")));
    return Number.isFinite(n) && n >= 1 ? clamp(n, 1, 500) : 10;
  });
  const [useCap, setUseCap] = useState(() => params.get("max") != null);
  const [cap, setCap] = useState(() => {
    const n = Number(params.get("max"));
    return Number.isFinite(n) && n > 0 ? String(n) : "24";
  });
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = usePool(3000);
  const rows = useMemo(() => (view ? rowsFor(view, vendorId) : []), [view, vendorId]);
  const bestCents = rows.reduce<number | null>((b, r) => (r.poolCents != null && (b == null || r.poolCents < b) ? r.poolCents : b), null);
  const facts = view ? poolFacts(view) : null;

  const capCents = useCap ? Math.round(Number(cap) * 100) : null;
  const capOk = !useCap || (Number.isFinite(capCents) && (capCents as number) > 0);
  const perSeatCap = Math.min(listCents, useCap && capOk ? (capCents as number) : listCents);
  const neverAbove = seats * perSeatCap;
  const atBest = seats * (bestCents ?? listCents);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (seats < 1 || seats > 500) return setError("Seats must be between 1 and 500.");
    if (!capOk) return setError("Enter a price cap above $0, or turn the cap off.");
    if (company.trim().length === 0) return setError("Enter your company name.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          buyerName: company.trim(),
          category: CATEGORY,
          seats,
          maxPricePerSeatCents: capCents,
          preferredVendorId: vendorId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong placing your order.");
      router.push(`/orders/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong placing your order.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 pb-12 pt-6">
      <nav aria-label="Breadcrumb" className="flex gap-2 text-[13px] text-muted">
        <Link href="/pool" className="text-muted hover:text-ink">
          Marketplace
        </Link>
        <span aria-hidden>/</span>
        <Link href="/pool" className="text-muted hover:text-ink">
          Compliance
        </Link>
        <span aria-hidden>/</span>
        <span>SOC 2 compliance software</span>
      </nav>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-label="Product" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[30px] font-semibold leading-[1.1] tracking-[-0.025em]">SOC 2 compliance software, {vendor ? vendor.name : "any vendor"}</h1>
            <p className="m-0 text-[15px] leading-[1.5] text-muted">
              {vendor
                ? `Per-seat plan, delivered as your own ${vendor.name} account. ${vendor.name} is a test vendor.`
                : "Per-seat plan, delivered as your own account with the vendor that wins. All five are test vendors."}
            </p>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="tabular text-[48px] font-semibold leading-none tracking-[-0.04em]">{usd(bestCents ?? listCents)}</span>
            <span className="text-[15px] text-muted">
              {bestCents != null ? (
                <>
                  a seat, best so far. List from <span className="tabular line-through">{usd(listCents)}</span>
                </>
              ) : (
                <>a seat, list. No group price yet</>
              )}
            </span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-baseline justify-between gap-3 pb-2.5">
              <h2 className="m-0 text-sm font-semibold">Quotes for this pool</h2>
              {view && facts && (
                <p className="tabular m-0 flex items-center gap-2 text-[13px] text-muted">
                  <span aria-hidden className="wi-live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                  {facts.seats} seats from {facts.startups} {facts.startups === 1 ? "startup" : "startups"}, closes in {closesIn(view.now, view.pool.windowClosesAt)}
                </p>
              )}
            </div>
            <div className={`${rowCls} pt-0 text-xs font-medium text-muted`}>
              <span>Vendor</span>
              <span className="tabular text-right">List</span>
              <span className="tabular text-right">This pool</span>
              <span>Status</span>
            </div>
            {rows.length === 0 ? (
              <p className="m-0 border-t border-[#f0f2f4] py-2.5 text-sm text-muted">Loading quotes</p>
            ) : (
              rows.map((r) => (
                <div key={r.id} className={`${rowCls} border-t border-[#f0f2f4]`}>
                  <span className="font-medium">{r.name}</span>
                  <span className="tabular text-right text-muted">{usd(r.listCents)}</span>
                  <span className={`tabular text-right font-semibold ${r.poolCents != null && r.poolCents === bestCents ? "text-accent-strong" : "text-ink"}`}>
                    {r.poolCents != null ? usd(r.poolCents) : ""}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-[13px] ${r.live ? "text-accent-strong" : "text-muted"}`}>
                    {r.live && <span aria-hidden className="wi-live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />}
                    {r.status}
                  </span>
                </div>
              ))
            )}
            <p className="mb-0 mt-2.5 text-[13px]">
              <Link href="/negotiation" className="font-medium text-accent-strong hover:text-accent">
                Watch the live negotiation
              </Link>
            </p>
          </div>

          <dl className="m-0 grid grid-cols-3 gap-4 border-t border-line pt-[18px]">
            <div>
              <dt className="text-[13px] font-medium text-muted">Delivery</dt>
              <dd className="mt-0.5 ml-0 text-sm">Redemption link, your own account</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-muted">Billing</dt>
              <dd className="mt-0.5 ml-0 text-sm">Card hold now, charged at the final price</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-muted">If no deal</dt>
              <dd className="mt-0.5 ml-0 text-sm">You pay list, never more</dd>
            </div>
          </dl>
        </section>

        <form aria-label="Place order" onSubmit={submit} className="flex flex-col gap-[18px] rounded-[10px] border border-line bg-surface p-6">
          <h2 className="m-0 text-[17px] font-semibold">Purchase order</h2>

          <div className="flex flex-col gap-2">
            <span id="seats-label" className="text-[13px] font-medium text-muted">
              Seats
            </span>
            <div role="group" aria-labelledby="seats-label" className="flex items-center gap-2">
              <button type="button" className={stepCls} aria-label="Fewer seats" disabled={seats <= 1} onClick={() => setSeats((s) => clamp(s - 1, 1, 500))}>
                -
              </button>
              <span className="tabular min-w-14 text-center text-[22px] font-semibold">{seats}</span>
              <button type="button" className={stepCls} aria-label="More seats" disabled={seats >= 500} onClick={() => setSeats((s) => clamp(s + 1, 1, 500))}>
                +
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" className="m-0 h-[18px] w-[18px] accent-accent" checked={useCap} onChange={(e) => setUseCap(e.target.checked)} />
              Only buy at or under a price I set
            </label>
            {useCap && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <span>$</span>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  aria-label="Maximum price per seat in dollars"
                  className={`tabular ${fieldCls} w-[90px]`}
                />
                <span>per seat</span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted">Company</span>
              <input className={fieldCls} type="text" autoComplete="organization" placeholder="Acme Inc." value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted">Work email</span>
              <input className={fieldCls} type="email" autoComplete="email" placeholder="you@acme.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">For the agent, optional</span>
            <textarea
              className={`${fieldCls} h-auto resize-y py-2.5`}
              rows={2}
              placeholder="For example: we need SSO, or an annual invoice instead of a card"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-1 border-t border-line pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">{bestCents != null ? "At today's best, about" : "At list, about"}</span>
              <span className="tabular text-base font-medium">{usd(atBest)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Never above</span>
              <span className="tabular text-2xl font-semibold tracking-[-0.02em]">{usd(neverAbove)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 cursor-pointer items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Placing order" : "Place order"}
          </button>

          {error && (
            <p role="alert" className="m-0 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <p className="m-0 text-xs leading-[1.5] text-muted">A simulated card hold for the never-above amount. Charged at the final price when the window closes.</p>
        </form>
      </div>
    </main>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-[1180px] px-6 pt-6 text-sm text-muted">Loading</main>}>
      <OrderForm />
    </Suspense>
  );
}
