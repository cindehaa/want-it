"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Order, PoolView } from "@/lib/contracts";
import { getJson } from "@/components/pool/api";
import { fmtDate, usdSeat } from "@/components/pool/format";
import BayMap, { type MapDot } from "./BayMap";
import "./demo.css";

type Phase = 0 | 1 | 2 | 3; // 0 buyers order, 1 marketplace groups, 2 group formed, 3 agents dispatched

const ARRIVE_MS = 400; // stagger between orders
const CHECK_MS = 170; // grouping sweep, per order
const FORMED_HOLD_MS = 2000; // group card on screen before dispatch
const DISPATCH_MS = 1500; // "agents dispatched" on screen before leaving for /negotiation

const CATEGORY_LABEL: Record<string, string> = {
  soc2_compliance: "SOC 2 compliance software",
  dev_tools: "Dev tools",
};

type Row = {
  order: Order;
  name: string;
  member: boolean;
  checks: { product: boolean; deadline: boolean; active: boolean };
  reason: string | null;
};

function cleanName(o: Order) {
  return o.buyerName.replace(/\s*\(simulated\)\s*$/i, "");
}

function orderDetail(o: Order) {
  const max = o.maxPricePerSeatCents != null ? `max ${usdSeat(o.maxPricePerSeatCents)}/seat` : "no max price";
  return `${o.seats} seats · ${max}`;
}

function buildRows(view: PoolView): Row[] {
  const { pool } = view;
  const windowMs = Date.parse(pool.windowClosesAt);
  const memberIds = new Set(pool.memberOrderIds);
  const exclusion = new Map(pool.exclusions.map((e) => [e.orderId, e.reason]));
  return [...view.orders]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((o) => {
      const code = exclusion.get(o.id);
      const product = o.category === pool.category && code !== "wrong_category";
      const deadline = Date.parse(o.deadline) >= windowMs && code !== "deadline_before_window";
      const active = o.status !== "canceled_by_buyer" && code !== "canceled";
      const member = memberIds.has(o.id);
      let reason: string | null = null;
      if (!member) {
        if (!product) reason = `Different product: ${CATEGORY_LABEL[o.category] ?? o.category}, not ${CATEGORY_LABEL[pool.category] ?? pool.category}`;
        else if (!deadline) reason = `Needs it by ${fmtDate(o.deadline)}, before the window closes ${fmtDate(pool.windowClosesAt)}`;
        else if (!active) reason = "Canceled by the buyer";
        else reason = "Not in this pool";
      }
      return { order: o, name: cleanName(o), member, checks: { product, deadline, active }, reason };
    });
}

export default function DemoClient() {
  const router = useRouter();
  const [view, setView] = useState<PoolView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(0);
  const [checked, setChecked] = useState(0);
  const [phase, setPhase] = useState<Phase>(0);
  const feedRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await getJson("/api/pool");
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setView(r.data as PoolView);
    setRun((n) => n + 1);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (view ? buildRows(view) : []), [view]);

  // One timeline drives all three stages from the real order list.
  useEffect(() => {
    if (rows.length === 0) return;
    const n = rows.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    setShown(0);
    setChecked(0);
    setPhase(0);
    rows.forEach((_, i) => at(700 + i * ARRIVE_MS, () => setShown(i + 1)));
    const groupStart = 700 + n * ARRIVE_MS + 800;
    at(groupStart, () => setPhase(1));
    rows.forEach((_, i) => at(groupStart + 400 + i * CHECK_MS, () => setChecked(i + 1)));
    const formedAt = groupStart + 400 + n * CHECK_MS + 600;
    at(formedAt, () => setPhase(2));
    const dispatchAt = formedAt + FORMED_HOLD_MS;
    at(dispatchAt, () => setPhase(3));
    const stay = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("stay");
    if (!stay) at(dispatchAt + DISPATCH_MS, () => router.push("/negotiation?autoplay=1"));
    return () => timers.forEach(clearTimeout);
  }, [rows, run, router]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (phase === 0) el.scrollTop = el.scrollHeight;
    else if (phase === 1) {
      const rowH = el.scrollHeight / Math.max(1, rows.length);
      el.scrollTop = Math.max(0, rowH * checked - el.clientHeight / 2);
    }
  }, [shown, checked, phase, rows.length]);

  const replay = () => {
    setShown(0);
    setChecked(0);
    setPhase(0);
    void load();
  };

  if (error) {
    return (
      <Shell phase={phase} progress={[0, 0, 0]} onReplay={replay}>
        <div className="mt-16 max-w-md">
          <p className="text-lg font-semibold">Couldn&apos;t load the order pool.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <button onClick={() => void load()} className="mt-4 rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-white">
            Try again
          </button>
        </div>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell phase={phase} progress={[0, 0, 0]} onReplay={replay}>
        <p className="mt-16 text-sm text-muted">Loading orders…</p>
      </Shell>
    );
  }
  if (rows.length === 0) {
    return (
      <Shell phase={phase} progress={[0, 0, 0]} onReplay={replay}>
        <div className="mt-16 max-w-md">
          <p className="text-lg font-semibold">No orders yet.</p>
          <p className="mt-1 text-sm text-muted">Place an order on the Buy page, or reset the demo data, then replay.</p>
          <Link href="/" className="mt-4 inline-block rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-white">
            Go to Buy
          </Link>
        </div>
      </Shell>
    );
  }

  const { pool } = view;
  const n = rows.length;
  const vendorCount = view.vendors.length;
  const memberRows = rows.filter((r) => r.member);
  const startups = pool.memberOrderIds.length;
  const seats = pool.totalSeats;
  const seatsSoFar = rows.slice(0, shown).reduce((s, r) => s + r.order.seats, 0);
  const maxes = memberRows.map((r) => r.order.maxPricePerSeatCents).filter((c): c is number => c != null);
  const noMax = memberRows.length - maxes.length;
  const leftOut = rows.filter((r) => !r.member);
  const latest = phase === 0 && shown > 0 ? rows[shown - 1].order.id : null;

  const dots: MapDot[] = rows.slice(0, shown).map((r, i) => {
    const judged = phase >= 2 || (phase === 1 && i < checked);
    return {
      id: r.order.id,
      name: r.name,
      seats: r.order.seats,
      lat: r.order.lat,
      lng: r.order.lng,
      state: judged ? (r.member ? "member" : "excluded") : "arrived",
      detail: orderDetail(r.order),
    };
  });

  const progress: [number, number, number] = [
    phase === 0 ? shown / n : 1,
    phase === 0 ? 0 : phase === 1 ? checked / n : 1,
    phase === 3 ? 1 : 0,
  ];

  const headline =
    phase === 0
      ? { h: "Startups buy alone.", p: "Independent founders in different places, each placing their own order. None of them know each other." }
      : phase === 1
        ? {
            h: "The marketplace groups what fits.",
            p: "Each order is checked for the same product, a deadline inside the pooling window, and not being canceled. Orders that fail are left out, with the reason.",
          }
        : {
            h: "Many buyers become one.",
            p: "One group request, backed by held cards. The buyers never talk to a vendor; agents do that for them.",
          };

  return (
    <Shell phase={phase} progress={progress} onReplay={replay}>
      <div key={phase >= 2 ? 2 : phase} className="dm-fade mt-9 max-w-[760px]">
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[56px]">{headline.h}</h1>
        <p className="mt-3 max-w-[620px] text-[16px] leading-relaxed text-muted">{headline.p}</p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[460px_minmax(0,1fr)] lg:gap-12">
        {/* Left: order feed, then the single group order */}
        <section aria-live="polite" className="min-w-0">
          {phase < 2 ? (
            <div>
              <div className="flex items-baseline justify-between border-b border-ink pb-2 text-[13px]">
                {phase === 0 ? (
                  <>
                    <span className="font-medium">Orders arriving</span>
                    <span className="tabular text-muted">
                      {shown} of {n} · {seatsSoFar} seats
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Compatibility</span>
                    <span className="flex text-[11px] text-muted">
                      <span className="w-[58px] text-center">Product</span>
                      <span className="w-[58px] text-center">Deadline</span>
                      <span className="w-[58px] text-center">Active</span>
                    </span>
                  </>
                )}
              </div>
              {phase === 1 && (
                <p className="border-b border-line py-2 text-[12px] text-muted">
                  Pool: {CATEGORY_LABEL[pool.category] ?? pool.category}, window closes {fmtDate(pool.windowClosesAt)}. Needs it on or after that date, order not canceled.
                </p>
              )}
              <ul ref={feedRef} className="max-h-[400px] overflow-y-auto lg:max-h-[470px]">
                {rows.slice(0, shown).map((r, i) => {
                  const judged = phase === 1 && i < checked;
                  const out = judged && !r.member;
                  return (
                    <li key={r.order.id} className="dm-row-in grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-[14px] font-medium ${out ? "text-faint line-through decoration-faint/60" : ""}`}>{r.name}</span>
                          {r.order.isSimulated ? (
                            <span className="shrink-0 rounded border border-line px-1 text-[10px] leading-4 text-muted">simulated</span>
                          ) : (
                            <span className="shrink-0 rounded bg-accent-soft px-1 text-[10px] font-medium leading-4 text-accent-strong">live buyer</span>
                          )}
                        </div>
                        <div className={`truncate text-[12px] ${out ? "text-muted" : "text-muted"}`}>
                          {out
                            ? `Left out: ${r.reason}`
                            : phase === 0
                              ? `${r.order.city} · ${orderDetail(r.order)} · card held, not charged`
                              : `${r.order.city} · ${orderDetail(r.order)}`}
                        </div>
                      </div>
                      {phase === 0 ? (
                        <span className="tabular text-[13px] text-muted">{r.order.seats}</span>
                      ) : (
                        <span className="flex">
                          <Check ok={r.checks.product} done={judged} />
                          <Check ok={r.checks.deadline} done={judged} />
                          <Check ok={r.checks.active} done={judged} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="dm-fade">
              <div className="border-t-2 border-accent pt-4">
                <p className="text-[13px] text-muted">Group order · {CATEGORY_LABEL[pool.category] ?? pool.category}</p>
                <p className="tabular mt-2 text-[44px] font-semibold leading-[1.02] tracking-tight">
                  {startups} startups
                  <br />
                  {seats} seats
                </p>
                <p className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-accent-strong">one group request</p>
                <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Their limits</dt>
                  <dd className="tabular">
                    {maxes.length
                      ? `${usdSeat(Math.min(...maxes))} to ${usdSeat(Math.max(...maxes))} per seat${noMax ? `, ${noMax} set no max` : ""}`
                      : "No max prices set"}
                  </dd>
                  <dt className="text-muted">Pool window</dt>
                  <dd>Closes {fmtDate(pool.windowClosesAt)}</dd>
                  <dt className="text-muted">Payment</dt>
                  <dd>Cards held, not charged</dd>
                </dl>
              </div>

              {phase === 3 && (
                <div className="dm-fade mt-6 border-t border-line pt-4">
                  <p className="text-[18px] font-semibold leading-snug tracking-tight">
                    Group order formed
                    <span className="mx-2 text-accent-strong" aria-hidden>
                      →
                    </span>
                    marketplace dispatched AI agents to {vendorCount} vendor{vendorCount === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">Opening the negotiation. No buyer is involved.</p>
                </div>
              )}

              {leftOut.length > 0 && (
                <div className="mt-6">
                  <p className="text-[12px] font-medium text-muted">Left out of the group</p>
                  <ul className="mt-1">
                    {leftOut.map((r) => (
                      <li key={r.order.id} className="border-t border-line py-1.5 text-[12px] text-muted">
                        <span className="font-medium text-ink">{r.name}</span>
                        {r.order.isSimulated ? " (simulated)" : ""}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: the map */}
        <section className="min-w-0">
          <BayMap dots={dots} latestId={latest} merged={phase >= 2} />
          <p className="mt-2 text-[12px] text-faint">Buyers marked simulated are demo data. Card holds are simulated.</p>
        </section>
      </div>
    </Shell>
  );
}

function Check({ ok, done }: { ok: boolean; done: boolean }) {
  return (
    <span className="flex w-[58px] justify-center">
      {!done ? (
        <span className="h-1 w-1 rounded-full bg-line" />
      ) : ok ? (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="dm-pop">
          <path d="M3.5 8.5l3 3 6-6.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="#5f6a75" strokeWidth="2" strokeLinecap="round" className="dm-pop">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      )}
    </span>
  );
}

const STEPS = ["Buyers order", "Marketplace groups", "Agents negotiate (automatic)"];

function Shell({
  phase,
  progress,
  onReplay,
  children,
}: {
  phase: Phase;
  progress: [number, number, number];
  onReplay: () => void;
  children: React.ReactNode;
}) {
  const status = (i: number): "done" | "active" | "pending" => {
    const active = phase === 3 ? 2 : phase === 2 ? -1 : phase;
    if (phase >= 2 && i < 2) return "done";
    if (phase === 1 && i === 0) return "done";
    return i === active ? "active" : "pending";
  };
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-white">
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] text-muted">Behind the scenes: what the buyer never sees</p>
          <button
            onClick={onReplay}
            className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Replay
          </button>
        </div>

        <ol className="mt-4 grid grid-cols-3 gap-3 sm:gap-5" aria-label="Progress">
          {STEPS.map((label, i) => {
            const s = status(i);
            return (
              <li key={label} aria-current={s === "active" ? "step" : undefined}>
                <div className="h-[3px] w-full bg-line">
                  <div
                    className="h-full bg-accent"
                    style={{
                      width: `${Math.round(progress[i] * 100)}%`,
                      transition: i === 2 ? `width ${DISPATCH_MS}ms linear` : "width 0.3s ease-out",
                    }}
                  />
                </div>
                <p className={`mt-2 flex items-baseline gap-2 text-[13px] ${s === "pending" ? "text-faint" : s === "done" ? "text-muted" : "font-semibold text-ink"}`}>
                  <span className="tabular">{i + 1}</span>
                  <span>{label}</span>
                  {s === "done" && (
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="done">
                      <path d="M3.5 8.5l3 3 6-6.5" />
                    </svg>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
        {children}
      </div>
    </main>
  );
}
