"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listPriceFor } from "@/lib/vendors";
import InlineNumber from "./InlineNumber";
import { usePoolPrice } from "./usePoolPrice";

const LIST_CENTS = listPriceFor("soc2_compliance", null);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const usdShort = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : usd(cents));

/** Returns a CSS class that restarts a flash animation whenever `key` changes (not on first render). */
function useFlash(key: unknown): string {
  const first = useRef(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setN((x) => x + 1);
  }, [key]);
  // Two keyframe names alternate so the animation restarts on every change.
  return n === 0 ? "" : n % 2 ? "wi-store-flash" : "wi-store-flash-b";
}

export default function Storefront() {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID()); // once per form mount
  const [seats, setSeats] = useState("10");
  const [useCap, setUseCap] = useState(true);
  const [cap, setCap] = useState("24");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = usePoolPrice(3000);
  const hasGroup = live.groupCents != null;
  const priceCents = live.groupCents ?? LIST_CENTS;
  const priceFlash = useFlash(live.groupCents);
  const pooledFlash = useFlash(live.pooled);

  const seatsN = Math.floor(Number(seats));
  const seatsOk = Number.isFinite(seatsN) && seatsN >= 1 && seatsN <= 500;
  const capCents = useCap ? Math.round(Number(cap) * 100) : null;
  const capOk = !useCap || (Number.isFinite(capCents) && (capCents as number) > 0);
  const perSeat = Math.min(LIST_CENTS, useCap && capOk ? (capCents as number) : LIST_CENTS);
  const total = Math.max(1, Math.min(500, seatsOk ? seatsN : Math.floor(Number(seats)) || 1)) * perSeat;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!seatsOk) return setError("Seats must be between 1 and 500.");
    if (!capOk) return setError("Enter a price cap above $0, or turn the cap off.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          buyerName: "Your startup", // company name is collected after confirm (see design)
          category: "soc2_compliance",
          seats: seatsN,
          maxPricePerSeatCents: capCents,
          preferredVendorId: null, // default: compare all vendors
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
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-6 pb-12 pt-10 sm:pt-[72px]">
      <section aria-label="Product" className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-line pb-7">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">SOC 2 compliance software</h1>
          <p className="mt-2 text-[15px] leading-[1.45] text-muted">
            Per-seat plan, your own account. Pooled with other startups; one agent negotiates one price. It only goes down.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className={`tabular m-0 text-[28px] font-semibold leading-none tracking-[-0.02em] ${priceFlash}`}>{usd(priceCents)}</p>
          <p className="mt-1.5 flex items-center gap-[7px] text-[13px] text-muted sm:justify-end">
            <span aria-hidden className="wi-live-dot inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
            {hasGroup ? (
              <span>
                group price so far, <span className="tabular line-through">{usdShort(LIST_CENTS)}</span> list
              </span>
            ) : (
              <span>no group price yet</span>
            )}
          </p>
          <p className="tabular mt-1 text-[13px] text-muted">
            <span className={pooledFlash}>{live.pooled}</span> {live.pooled === 1 ? "startup" : "startups"} pooled
          </p>
        </div>
      </section>

      <form aria-label="Order" onSubmit={submit} className="flex flex-col gap-7">
        <p className="m-0 text-[26px] font-normal leading-[1.6] tracking-[-0.01em]">
          We need <InlineNumber label="Seats" value={seats} onChange={setSeats} min={1} max={500} /> seats.
        </p>

        <div className="flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
            <input type="checkbox" className="m-0 h-[18px] w-[18px] accent-accent" checked={useCap} onChange={(e) => setUseCap(e.target.checked)} />
            Set a price cap
          </label>
          {useCap && (
            <p className="m-0 text-[26px] leading-[1.6] tracking-[-0.01em]">
              Only buy at or under{" "}
              <InlineNumber label="Maximum price per seat in dollars" prefix="$" value={cap} onChange={setCap} min={1} step="any" /> a seat.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-5 border-t border-line pt-6">
          <div>
            <p className="m-0 text-sm text-muted">You will pay at most</p>
            <p className="tabular mb-0 mt-0.5 text-2xl font-semibold tracking-[-0.02em]">
              ${(total / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 shrink-0 cursor-pointer items-center rounded-lg bg-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Placing order…" : "Place order"}
          </button>
        </div>

        {error && (
          <p role="alert" className="m-0 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <p className="m-0 text-xs leading-normal text-muted">
          A simulated card hold, charged only at the final price. Company name and contact come after you confirm. All five vendors are test vendors.
        </p>
      </form>
    </main>
  );
}
