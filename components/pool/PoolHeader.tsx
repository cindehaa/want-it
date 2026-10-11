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
  const n = view.pool.memberOrderIds.length;

  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="tabular">{closed ? "Pooling window closed" : `Pooling window closes in ${fmtRemaining(closesInMs)}`}</span>
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
        {view.demoMode && <DemoClock view={view} closesInMs={closesInMs} onChanged={onChanged} />}
      </div>

      <h1 className="mt-6 max-w-[34ch] text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[38px]">
        <span>{n} startups each want SOC 2 software.</span>{" "}
        <span className="text-muted">
          Instead of {n} founders each calling sales, our AI agent negotiates once for all of them.
        </span>
      </h1>
    </header>
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
    "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col items-start sm:items-end" aria-label="Demo clock">
      <div className="flex flex-wrap items-center gap-x-0.5 rounded-md border border-dashed border-line px-1.5 py-0.5">
        <span className="px-1 text-[11px] text-faint">
          Demo clock <span className="tabular">{view.clockOffsetHours > 0 ? `+${Math.round(view.clockOffsetHours * 10) / 10}h` : "real time"}</span>
        </span>
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
        <p role="alert" className="mt-1 max-w-[320px] break-words text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
