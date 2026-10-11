"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Order } from "@/lib/contracts";

type OrderResponse = {
  order: Order;
  listPricePerSeatCents: number;
  dealVendorId: string | null;
  pool: { status: string; totalSeats: number; members: number; windowClosesAt: string };
  quotes: { count: number; bestPricePerSeatCents: number | null; bestVendorId: string | null };
};

const money = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
const vendorName = (id: string | null) => (id ? `${id.charAt(0).toUpperCase()}${id.slice(1)} (test vendor)` : "a vendor");
const CANCELLABLE = ["held", "pooled", "negotiating"];

type StepState = "done" | "current" | "pending" | "bad";
type Step = { label: string; detail?: string; state: StepState };

function buildSteps(d: OrderResponse): Step[] {
  const o = d.order;
  const hold = money(o.seats * Math.min(d.listPricePerSeatCents, o.maxPricePerSeatCents ?? d.listPricePerSeatCents));
  const finalTotal = o.finalPricePerSeatCents != null ? money(o.finalPricePerSeatCents * o.seats) : null;
  const steps: Step[] = [{ label: "Order placed", detail: `Card hold of ${hold} (simulated)`, state: "done" }];

  if (o.status === "canceled_by_buyer") {
    steps.push({ label: "Canceled by you", detail: "Hold released. You were not charged.", state: "bad" });
    return steps;
  }

  const pooled = o.status !== "held";
  steps.push({
    label: pooled ? `Pooled with ${d.pool.members} buyer${d.pool.members === 1 ? "" : "s"}` : "Waiting to join the pool",
    detail: pooled ? `${d.pool.totalSeats} seats in the group` : undefined,
    state: pooled ? "done" : "current",
  });

  const decided = ["deal_applied", "list_price", "canceled_over_max", "charged"].includes(o.status);
  const negotiating = o.status === "negotiating" || ["negotiating", "deal_found", "no_deal", "settled"].includes(d.pool.status);
  steps.push({
    label: "Negotiating",
    detail: !pooled
      ? undefined
      : d.quotes.count > 0
        ? `${d.quotes.count} vendor quote${d.quotes.count === 1 ? "" : "s"} so far` +
          (d.quotes.bestPricePerSeatCents != null ? ` · best ${money(d.quotes.bestPricePerSeatCents)}/seat` : "")
        : decided
          ? "No vendor quotes were received"
          : negotiating
            ? "Our agent is talking to vendors"
          : "Starts when the pool is ready",
    state: decided ? "done" : pooled && negotiating ? "current" : "pending",
  });

  if (o.status === "deal_applied" || o.status === "charged") {
    const price = o.finalPricePerSeatCents;
    steps.push({ label: price != null ? `Deal found: ${money(price)}/seat` : "Deal found", detail: finalTotal ? `${finalTotal} total for ${o.seats} seats` : undefined, state: "done" });
  } else if (o.status === "list_price") {
    steps.push({ label: `No better deal (list ${money(d.listPricePerSeatCents)}/seat)`, detail: "Vendors didn't beat list price. You pay list, never more.", state: "done" });
  } else if (o.status === "canceled_over_max") {
    steps.push({ label: "Canceled: deal didn't reach your max", detail: "Hold released. You were not charged.", state: "bad" });
    return steps;
  } else {
    steps.push({ label: "Result", detail: "A better price, no better deal, or a cancel if the price is over your max", state: "pending" });
  }

  steps.push({
    label: "Payment is simulated",
    detail: "This demo saves the final price. It does not charge a real card.",
    state: decided ? "done" : "pending",
  });
  return steps;
}

const dot: Record<StepState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-white text-emerald-700 ring-2 ring-emerald-600",
  pending: "bg-zinc-100 text-zinc-400",
  bad: "bg-red-100 text-red-700",
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OrderResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      if (res.status === 404) return setMissing(true);
      if (res.ok) setData(await res.json());
    } catch {
      /* transient; next poll retries */
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function cancel() {
    if (!window.confirm("Cancel this order? Your card hold will be released.")) return;
    setCanceling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: "POST" });
      if (!res.ok) setCancelError((await res.json().catch(() => null))?.error ?? "Could not cancel.");
      await load();
    } finally {
      setCanceling(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          want<span className="text-emerald-600">-it</span>
        </Link>
        <Link href="/pool" className="text-sm text-zinc-500 hover:text-emerald-700">
          Marketplace view
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">{children}</main>
    </div>
  );

  if (missing) return shell(<p className="text-zinc-600">We couldn&apos;t find that order. <Link href="/" className="text-emerald-700 underline">Back to the store</Link></p>);
  if (!data) return shell(<p className="text-zinc-500">Loading your order…</p>);

  const o = data.order;
  const list = data.listPricePerSeatCents;
  const canceled = o.status === "canceled_by_buyer" || o.status === "canceled_over_max";
  const steps = buildSteps(data);
  const dealPrice = o.status === "deal_applied" || o.status === "charged" ? o.finalPricePerSeatCents : null;
  const saved = dealPrice != null && dealPrice < list ? (list - dealPrice) * o.seats : 0;

  return shell(
    <>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ${canceled ? "bg-red-100 text-red-700" : "bg-emerald-600 text-white"}`}>{canceled ? "✕" : "✓"}</span>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {o.status === "canceled_by_buyer" ? "Order canceled" : o.status === "canceled_over_max" ? "Order canceled" : "Order confirmed ✓"}
        </h1>
      </div>
      {!canceled && <p className="mt-2 text-zinc-600">You can close this page. We&apos;ll keep working on your price.</p>}

      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {canceled ? (
          <p className="text-lg font-semibold">
            {o.status === "canceled_over_max" ? "The deal didn't reach your max, so your hold was released." : "Your hold was released."}
            <span className="block text-sm font-normal text-zinc-500">You were not charged.</span>
          </p>
        ) : (
          <p className="text-lg font-semibold">
            You&apos;ll pay at most {money(o.holdAmountCents)}
            <span className="ml-1 text-sm font-normal text-zinc-500">(card hold — simulated)</span>
          </p>
        )}
        <p className="mt-1 text-sm text-zinc-500">
          {o.buyerName} · {o.seats} seat{o.seats === 1 ? "" : "s"} · SOC 2 compliance software · list {money(list)}/seat
          {o.maxPricePerSeatCents != null && <> · your max {money(o.maxPricePerSeatCents)}/seat</>}
        </p>
      </div>

      {o.status === "deal_applied" && dealPrice != null && (
        <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-800">Price drop</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">
            <span className="text-emerald-700/60 line-through">{money(list)}</span> → {money(dealPrice)}
            <span className="text-base font-medium"> /seat</span>
          </p>
          {saved > 0 && (
            <p className="mt-1 text-sm text-emerald-900">
              You save {money(saved)} across {o.seats} seats ({Math.round(((list - dealPrice) / list) * 100)}% off list).
            </p>
          )}
          {o.redemptionLink && (
            <div className="mt-4 border-t border-emerald-200 pt-3 text-sm">
              <p className="text-emerald-900">Redeem with {vendorName(data.dealVendorId)}:</p>
              <a href={o.redemptionLink} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-emerald-800 underline">
                {o.redemptionLink}
              </a>
              <p className="mt-1 text-xs text-emerald-800/80">Test redemption link. The vendor is fictional and nothing real is provisioned.</p>
            </div>
          )}
        </div>
      )}

      {o.status === "list_price" && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
          No vendor beat list price, so you pay list ({money(list)}/seat). You are never charged more than list.
        </div>
      )}

      <ol className="mt-6 space-y-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
            {i < steps.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-zinc-200" aria-hidden />}
            <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${dot[s.state]}`}>
              {s.state === "done" ? "✓" : s.state === "bad" ? "✕" : i + 1}
            </span>
            <div className={s.state === "pending" ? "text-zinc-400" : ""}>
              <p className={`font-medium ${s.state === "pending" ? "" : "text-zinc-900"}`}>{s.label}</p>
              {s.detail && <p className="text-sm text-zinc-500">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/pool" className="text-sm font-medium text-emerald-700 hover:underline">
          See what&apos;s happening behind the scenes →
        </Link>
        {CANCELLABLE.includes(o.status) && (
          <button
            onClick={cancel}
            disabled={canceling}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
          >
            {canceling ? "Canceling…" : "Cancel order"}
          </button>
        )}
      </div>
      {cancelError && <p className="mt-2 text-sm text-red-700">{cancelError}</p>}
    </>,
  );
}
