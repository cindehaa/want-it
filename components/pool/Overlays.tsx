"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PoolView } from "@/lib/contracts";
import { postJson } from "./api";
import { usd, usdSeat } from "./format";
import type { DataSource } from "./PoolHeader";
import { bestGroupPrice, listCents, productName, yourPrice } from "./pricing";
import { Spinner } from "./ui";

const PILL_SHADOW = "shadow-[0_4px_14px_rgba(18,23,28,.06)]";

/** Bold number that flashes emerald when its value changes after first paint. */
function Flash({ value }: { value: string | number }) {
  const first = useRef(value);
  return (
    <strong key={String(value)} className={value !== first.current ? "mf-flash" : undefined}>
      {value}
    </strong>
  );
}

export function SearchPill({ category }: { category: string }) {
  const chip = productName(category).replace(/ seats$/, "");
  return (
    <form
      role="search"
      onSubmit={(e) => e.preventDefault()}
      className={`flex w-full items-center gap-2 rounded-[10px] border border-line bg-white py-1.5 pl-3 pr-1.5 sm:w-[380px] sm:min-w-0 sm:shrink ${PILL_SHADOW}`}
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#5f6a75" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        type="search"
        aria-label="Search software"
        placeholder="Search software"
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
      />
      <span className="whitespace-nowrap rounded-md bg-accent-soft px-[9px] py-[5px] text-xs font-medium text-accent-strong">{chip}</span>
    </form>
  );
}

export function StatPill({ view, source, stale }: { view: PoolView; source: DataSource; stale: boolean }) {
  const seats = view.pool.totalSeats;
  const startups = view.pool.memberOrderIds.length;
  const best = bestGroupPrice(view);
  const list = listCents(view);
  return (
    <div
      className={`flex w-full flex-wrap items-center gap-x-[18px] gap-y-1 rounded-[10px] border border-line bg-white px-4 py-2.5 text-sm sm:w-auto sm:shrink-0 ${PILL_SHADOW}`}
    >
      <p className="tabular m-0 flex items-center gap-2">
        <span aria-hidden className="mf-live-dot inline-block h-[7px] w-[7px] rounded-full bg-accent" />
        <span>
          <Flash value={seats} /> seats from <Flash value={startups} /> startups
        </span>
      </p>
      <span aria-hidden className="hidden h-[18px] w-px bg-line sm:block" />
      {best != null ? (
        <p className="tabular m-0">
          best <strong>{usdSeat(best)}</strong> a seat, <s className="text-faint">{usd(list)}</s>
        </p>
      ) : (
        <p className="tabular m-0">
          <strong>{usd(list)}</strong> a seat <span className="text-faint">· no group price yet</span>
        </p>
      )}
      {source === "fixture" && <span className="text-[11px] text-warn">sample data</span>}
      {source === "live" && stale && <span className="text-[11px] text-danger">reconnecting</span>}
    </div>
  );
}

export function Legend({ className = "" }: { className?: string }) {
  return (
    <div
      aria-label="Legend"
      className={`items-center gap-[14px] rounded-lg border border-line bg-white/90 px-2.5 py-1.5 text-xs text-muted ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#059669] bg-[rgba(16,185,129,.35)]" />
        Pooled
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-[#64748b]" />
        Excluded
      </span>
      <span>Size is seats</span>
    </div>
  );
}

export function OrderDock({ view }: { view: PoolView }) {
  const router = useRouter();
  const [seats, setSeats] = useState(10);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per mount: a double click or a retry never creates a second order.
  const [idempotencyKey] = useState(() => `pool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  const list = listCents(view);
  const group = yourPrice(view, seats);
  const price = group ?? list;

  async function join() {
    setPending(true);
    setError(null);
    const res = await postJson("/api/orders", {
      idempotencyKey,
      buyerName: "Your startup",
      category: view.pool.category,
      seats,
      maxPricePerSeatCents: null,
      preferredVendorId: null,
    });
    if (!res.ok) {
      setPending(false);
      setError(res.error);
      return;
    }
    const id = (res.data as { id?: unknown } | null)?.id;
    if (typeof id !== "string") {
      setPending(false);
      setError("The order was placed but the server sent no order id.");
      return;
    }
    router.push(`/orders/${encodeURIComponent(id)}`);
  }

  return (
    <section
      aria-label="Join the pool"
      className="absolute inset-x-3 bottom-[76px] z-10 flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-[0_10px_30px_rgba(18,23,28,.10)] sm:inset-x-auto sm:left-1/2 sm:w-max sm:max-w-[calc(100%-24px)] sm:-translate-x-1/2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5 sm:py-3.5 sm:pl-5 sm:pr-4 xl:bottom-6"
    >
      <div className="min-w-0">
        <p className="m-0 text-[15px] font-semibold">{productName(view.pool.category)}</p>
        <p className="tabular m-0 mt-0.5 text-[13px] text-muted">
          Your price today: {usdSeat(price)} a seat{group == null ? " (list)" : ""}, only goes down
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:contents">
        <div role="group" aria-label="Seats" className="flex items-center justify-between gap-1.5 sm:justify-start">
          <button type="button" className="mf-step" aria-label="Fewer seats" disabled={seats <= 1} onClick={() => setSeats((s) => Math.max(1, s - 1))}>
            &minus;
          </button>
          <span className="tabular min-w-11 text-center text-lg font-semibold" aria-live="polite">
            {seats}
          </span>
          <button type="button" className="mf-step" aria-label="More seats" disabled={seats >= 500} onClick={() => setSeats((s) => Math.min(500, s + 1))}>
            +
          </button>
        </div>
        <button
          type="button"
          onClick={join}
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {pending && <Spinner />}
          Join the pool, at most {usd(seats * price)}
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 w-full break-words text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
