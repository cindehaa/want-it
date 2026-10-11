"use client";

import { useState } from "react";
import type { PoolView } from "@/lib/contracts";
import { postJson } from "./api";
import { fmtRemaining } from "./format";
import { Badge, Spinner } from "./ui";

const STATUS: Record<PoolView["pool"]["status"], { label: string; tone: "neutral" | "accent" | "warn" | "danger" | "ink" }> = {
  open: { label: "Open", tone: "accent" },
  negotiating: { label: "Negotiating", tone: "warn" },
  deal_found: { label: "Deal found", tone: "accent" },
  no_deal: { label: "No better deal", tone: "neutral" },
  settled: { label: "Settled", tone: "ink" },
};

export type DataSource = "live" | "fixture";

export default function PoolHeader({
  view,
  source,
  stale,
  onChanged,
}: {
  view: PoolView;
  source: DataSource;
  stale: boolean;
  onChanged: () => void;
}) {
  const st = STATUS[view.pool.status];
  const closesInMs = new Date(view.pool.windowClosesAt).getTime() - new Date(view.now).getTime();
  const closed = view.pool.status === "settled" || closesInMs <= 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Marketplace</h1>
          <Badge tone={st.tone}>{st.label}</Badge>
          {source === "fixture" && (
            <Badge tone="warn" title="The pool API is unreachable, so this is local sample data.">
              fixture data
            </Badge>
          )}
          {source === "live" && stale && (
            <Badge tone="danger" title="The last refresh failed. Showing the previous data.">
              reconnecting
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted">SOC 2 compliance seats, pooled across startups into one group price.</p>
        <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
          <HeaderStat value={String(view.pool.totalSeats)} label="seats in pool" />
          <HeaderStat value={String(view.pool.memberOrderIds.length)} label="startups pooled" />
          <HeaderStat value={closed ? "Closed" : fmtRemaining(closesInMs)} label={closed ? "pooling window" : "until the window closes"} />
        </dl>
      </div>

      {view.demoMode && <DemoClock view={view} closesInMs={closesInMs} onChanged={onChanged} />}
    </div>
  );
}

function HeaderStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="tabular order-1 text-lg font-semibold tracking-tight">{value}</dd>
      <dt className="order-2 text-xs text-muted">{label}</dt>
    </div>
  );
}

function DemoClock({ view, closesInMs, onChanged }: { view: PoolView; closesInMs: number; onChanged: () => void }) {
  const [pending, setPending] = useState<null | "plus" | "close" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "plus" | "close" | "reset", path: string, body: unknown) {
    setPending(kind);
    setError(null);
    const res = await postJson(path, body);
    setPending(null);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  const btn =
    "inline-flex h-7 items-center gap-1.5 rounded border border-line bg-white px-2 text-[11px] font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="w-full shrink-0 rounded-lg border border-dashed border-line bg-white/60 p-2.5 lg:w-auto" aria-label="Demo clock">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-muted">Demo clock</span>
        <span className="tabular text-[11px] text-faint">
          {view.clockOffsetHours > 0 ? `+${Math.round(view.clockOffsetHours * 10) / 10}h ahead` : "real time"}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={pending !== null} onClick={() => run("plus", "/api/demo/clock", { advanceHours: 24 })}>
          {pending === "plus" && <Spinner />}+24h
        </button>
        <button
          type="button"
          className={btn}
          disabled={pending !== null}
          onClick={() => {
            if (closesInMs <= 0) {
              setError("The window is already closed.");
              return;
            }
            // round up so the window is certainly closed afterwards
            const advanceHours = Math.ceil((closesInMs / 3600_000) * 60) / 60;
            void run("close", "/api/demo/clock", { advanceHours });
          }}
        >
          {pending === "close" && <Spinner />}
          Close window now
        </button>
        <button type="button" className={btn} disabled={pending !== null} onClick={() => run("reset", "/api/demo/reset", {})}>
          {pending === "reset" && <Spinner />}
          Reset demo
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 max-w-[320px] break-words text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
