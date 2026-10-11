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

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vendorName = (id: string | null) => (id ? `${id.charAt(0).toUpperCase()}${id.slice(1)} (test vendor)` : "a vendor");
const CANCELLABLE = ["held", "pooled", "negotiating"];

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

function closesIn(closesAtIso: string): string {
  const ms = new Date(closesAtIso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "closing";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d ${h - d * 24}h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

type StepState = "done" | "current" | "pending" | "bad";
type Step = { label: string; detail?: string; state: StepState; when?: string };

function buildSteps(d: OrderResponse): Step[] {
  const o = d.order;
  const hold = money(o.seats * Math.min(d.listPricePerSeatCents, o.maxPricePerSeatCents ?? d.listPricePerSeatCents));
  const finalTotal = o.finalPricePerSeatCents != null ? money(o.finalPricePerSeatCents * o.seats) : null;
  const placedAt = clock(o.createdAt);
  const steps: Step[] = [{ label: "Placed", detail: `Card hold of ${hold}, simulated`, state: "done", when: placedAt }];

  if (o.status === "canceled_by_buyer") {
    steps.push({ label: "Canceled by you", detail: "Hold released. You were not charged.", state: "bad", when: clock(o.updatedAt) });
    return steps;
  }

  const pooled = o.status !== "held";
  steps.push({
    label: pooled ? `Pooled with ${d.pool.members} ${d.pool.members === 1 ? "startup" : "startups"}` : "Waiting to join the pool",
    detail: pooled ? `${d.pool.totalSeats} seats in the group` : undefined,
    state: pooled ? "done" : "current",
    when: pooled ? placedAt : "live",
  });

  const decided = ["deal_applied", "list_price", "canceled_over_max", "charged"].includes(o.status);
  const negotiating = o.status === "negotiating" || ["negotiating", "deal_found", "no_deal", "settled"].includes(d.pool.status);
  const negotiatingNow = !decided && pooled && negotiating;
  steps.push({
    label: negotiatingNow ? "Negotiating now" : "Negotiating",
    detail: !pooled
      ? undefined
      : d.quotes.count > 0
        ? `${d.quotes.count} vendor ${d.quotes.count === 1 ? "quote" : "quotes"} so far` +
          (d.quotes.bestPricePerSeatCents != null ? `. Best so far ${money(d.quotes.bestPricePerSeatCents)} a seat` : "")
        : decided
          ? "No vendor quotes were received"
          : negotiating
            ? "Our agent is talking to vendors"
            : "Starts when the pool is ready",
    state: decided ? "done" : negotiatingNow ? "current" : "pending",
    when: negotiatingNow ? "live" : undefined,
  });

  if (o.status === "deal_applied" || o.status === "charged") {
    const price = o.finalPricePerSeatCents;
    steps.push({ label: price != null ? `Deal found, ${money(price)} a seat` : "Deal found", detail: finalTotal ? `${finalTotal} total for ${o.seats} seats` : undefined, state: "done" });
  } else if (o.status === "list_price") {
    steps.push({ label: `No better deal, list ${money(d.listPricePerSeatCents)} a seat`, detail: "Vendors did not beat list price. You pay list, never more.", state: "done" });
  } else if (o.status === "canceled_over_max") {
    steps.push({ label: "Canceled, the deal did not reach your cap", detail: "Hold released. You were not charged.", state: "bad" });
    return steps;
  } else {
    steps.push({ label: "Final price", detail: "A better price, list, or a cancel if the price is over your cap", state: "pending", when: closesIn(d.pool.windowClosesAt) });
  }

  steps.push({
    label: "Charged, simulated",
    detail: decided ? "This demo saves the final price. It does not charge a real card." : "At your final price when the window closes",
    state: decided ? "done" : "pending",
  });
  return steps;
}

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

  const shell = (children: React.ReactNode) => <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-12">{children}</main>;

  if (missing)
    return shell(
      <p className="m-0 text-muted">
        We could not find that order.{" "}
        <Link href="/" className="text-accent-strong underline">
          Back to the store
        </Link>
      </p>,
    );
  if (!data) return shell(<p className="m-0 text-muted">Loading your order</p>);

  const o = data.order;
  const list = data.listPricePerSeatCents;
  const canceled = o.status === "canceled_by_buyer" || o.status === "canceled_over_max";
  const steps = buildSteps(data);
  const dealPrice = o.status === "deal_applied" || o.status === "charged" ? o.finalPricePerSeatCents : null;
  const saved = dealPrice != null && dealPrice < list ? (list - dealPrice) * o.seats : 0;
  const hold = money(o.holdAmountCents);
  const liveNegotiation = steps.some((s) => s.state === "current");

  const heading = canceled ? "Order canceled" : dealPrice != null ? "Deal applied" : o.status === "list_price" ? "Final price is list" : "Order placed";
  const sub = canceled
    ? o.status === "canceled_over_max"
      ? "The deal did not reach your cap. Your hold was released and you were not charged."
      : "Your hold was released. You were not charged."
    : dealPrice != null
      ? "Your group price is in. The redemption link below is yours."
      : o.status === "list_price"
        ? "No vendor beat list price. You pay list, never more."
        : "You can close this page. The agent keeps working on your price.";

  return shell(
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[30px] font-semibold leading-[1.1] tracking-[-0.025em]">{heading}</h1>
        <p className="m-0 text-[15px] text-muted">{sub}</p>
      </div>

      <section aria-label="Order" className="flex flex-col gap-[22px] rounded-[10px] border border-line bg-surface px-7 py-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <dl className="tabular m-0 grid grid-cols-[repeat(3,auto)] justify-start gap-6 text-sm">
            <div>
              <dt className="text-xs text-muted">Product</dt>
              <dd className="mt-0.5 ml-0">SOC 2 compliance, {o.preferredVendorId ? vendorName(o.preferredVendorId).replace(" (test vendor)", "") : "any vendor"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Seats</dt>
              <dd className="mt-0.5 ml-0">{o.seats}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Company</dt>
              <dd className="mt-0.5 ml-0">{o.buyerName}</dd>
            </div>
          </dl>
          <div className="text-right">
            <p className="m-0 text-xs text-muted">{canceled ? "Hold released" : "Never above"}</p>
            <p className="tabular mb-0 mt-0.5 text-[28px] font-semibold leading-none tracking-[-0.025em]">{hold}</p>
          </div>
        </div>

        {dealPrice != null && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-[18px] text-sm">
            <p className="tabular m-0">
              Price drop: <span className="line-through">{money(list)}</span> to <span className="font-semibold">{money(dealPrice)}</span> a seat
              {saved > 0 && <>, you save {money(saved)} across {o.seats} seats ({Math.round(((list - dealPrice) / list) * 100)}% off list)</>}.
            </p>
            {o.redemptionLink && (
              <p className="m-0 text-muted">
                Redeem with {vendorName(data.dealVendorId)}:{" "}
                <a href={o.redemptionLink} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-accent-strong underline">
                  {o.redemptionLink}
                </a>
                <span className="mt-1 block text-xs">Test redemption link. The vendor is fictional and nothing real is provisioned.</span>
              </p>
            )}
          </div>
        )}

        <ol className="m-0 list-none border-t border-line p-0">
          {steps.map((s, i) => (
            <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-[#f0f2f4] py-3">
              <span aria-hidden className="inline-flex justify-center">
                {s.state === "current" && <span className="wi-live-dot inline-block h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={`text-[15px] ${s.state === "current" ? "font-semibold" : "font-medium"} ${s.state === "pending" ? "text-faint" : "text-ink"}`}>{s.label}</span>
                {s.detail && <span className="tabular text-[13px] text-muted">{s.detail}</span>}
              </span>
              <span className="tabular text-xs text-faint">{s.when ?? ""}</span>
            </li>
          ))}
        </ol>

        <p className="m-0 text-xs text-muted">
          {canceled ? `Simulated card hold for ${hold}, released. Nothing was charged.` : `Simulated card hold for ${hold}. Charged at the final price when the window closes, never above list.`}
        </p>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Link
          href="/negotiation"
          className="inline-flex h-12 items-center gap-2.5 rounded-lg bg-ink px-[22px] text-[15px] font-semibold text-white hover:bg-black"
        >
          {liveNegotiation && <span aria-hidden className="wi-live-dot inline-block h-2 w-2 rounded-full bg-accent" />}
          Watch the live negotiation
        </Link>
        {CANCELLABLE.includes(o.status) && (
          <button type="button" onClick={cancel} disabled={canceling} className="cursor-pointer border-0 bg-transparent p-0 text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60">
            {canceling ? "Canceling" : "Cancel order"}
          </button>
        )}
      </div>
      {cancelError && (
        <p role="alert" className="m-0 text-sm text-danger">
          {cancelError}
        </p>
      )}
    </>,
  );
}
