"use client";

import { useState } from "react";
import type { PoolView } from "@/lib/contracts";
import { postJson } from "./api";
import { usd, usdSeat } from "./format";
import type { Phase } from "./Story";
import { Spinner } from "./ui";

function Outcome({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-4 sm:block">
      <div className="tabular w-[136px] shrink-0 text-[32px] font-semibold leading-none tracking-[-0.04em] sm:w-auto sm:text-[44px]">{value}</div>
      <div className="min-w-0 sm:mt-2">
        <div className="text-[14px] font-medium leading-snug">{label}</div>
        {sub && <div className="text-[12px] leading-snug text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/** The single "Settle pool" action, and once settled, what happened to the buyers. */
export default function SettlePanel({ view, phase, onChanged }: { view: PoolView; phase: Phase; onChanged: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busyCall = view.calls.some((c) => c.status === "queued" || c.status === "in_progress");
  const canSettle = view.calls.length > 0 || view.quotes.length > 0;
  const primary = phase === "settle";

  async function settle() {
    setPending(true);
    setError(null);
    const res = await postJson("/api/pool/settle", {});
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged();
  }

  if (phase === "done") return <SettledOutcome view={view} />;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={settle}
          disabled={pending || busyCall || !canSettle}
          className={`inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            primary ? "bg-accent text-white hover:bg-accent-strong" : "border border-line bg-white text-ink hover:bg-canvas"
          }`}
        >
          {pending && <Spinner />}
          Settle pool
        </button>
        <p className="max-w-[56ch] text-[13px] leading-snug text-muted">
          {primary
            ? "Applies the best quote to every buyer. Anyone whose max price is below it is canceled and their card hold is released."
            : "Available after the agent has called a vendor."}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function SettledOutcome({ view }: { view: PoolView }) {
  const members = new Set(view.pool.memberOrderIds);
  const orders = view.orders.filter((o) => members.has(o.id));
  const catVendors = view.vendors.filter((v) => v.category === view.pool.category);
  const listCents = catVendors.length ? Math.min(...catVendors.map((v) => v.listPricePerSeatCents)) : 3000;

  const canceled = orders.filter((o) => o.status === "canceled_over_max").length;
  const paying = orders.filter((o) => o.finalPricePerSeatCents != null && o.status !== "canceled_over_max" && o.status !== "canceled_by_buyer");
  const applied = paying.filter((o) => (o.finalPricePerSeatCents as number) < listCents).length;
  const atList = paying.length - applied;
  const seats = paying.reduce((s, o) => s + o.seats, 0);
  const avgCents = seats > 0 ? paying.reduce((s, o) => s + (o.finalPricePerSeatCents as number) * o.seats, 0) / seats : null;
  const pct = avgCents != null && listCents > 0 ? Math.round((1 - avgCents / listCents) * 100) : null;

  return (
    <div className="mt-6 border-t border-line pt-5" role="status">
      <p className="text-[15px] font-semibold">Pool settled. Cards are charged at the final price (simulated).</p>
      <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-3">
        <Outcome value={String(applied)} label={applied === 1 ? "deal applied" : "deals applied"} sub={atList > 0 ? `${atList} at list price` : "at the group price"} />
        <Outcome
          value={String(canceled)}
          label="canceled over max"
          sub={canceled > 0 ? "price above their limit, hold released" : "nobody priced out"}
        />
        <Outcome
          value={avgCents == null ? "n/a" : usd(Math.round(avgCents))}
          label="average per seat"
          sub={avgCents == null ? "no price applied" : `vs ${usdSeat(listCents)} list${pct != null && pct > 0 ? `, ${pct}% less` : ""}`}
        />
      </div>
    </div>
  );
}
