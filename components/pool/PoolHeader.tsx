"use client";

import type { PoolView } from "@/lib/contracts";
import { fmtRemaining } from "./format";
import { Badge } from "./ui";

const STATUS: Record<PoolView["pool"]["status"], { label: string; tone: "neutral" | "accent" | "warn" | "danger" | "ink" }> = {
  open: { label: "Open", tone: "accent" },
  negotiating: { label: "Negotiating", tone: "warn" },
  deal_found: { label: "Deal found", tone: "accent" },
  no_deal: { label: "No better deal", tone: "neutral" },
  settled: { label: "Settled", tone: "ink" },
};

export type DataSource = "live" | "fixture";

/** Pool status + window line, shown at the top of the Details drawer. (Demo clock lives in DemoControls.) */
export default function PoolHeader({ view, source, stale }: { view: PoolView; source: DataSource; stale: boolean }) {
  const st = STATUS[view.pool.status];
  const closesInMs = new Date(view.pool.windowClosesAt).getTime() - new Date(view.now).getTime();
  const closed = view.pool.status === "settled" || closesInMs <= 0;
  const n = view.pool.memberOrderIds.length;

  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
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
      <p className="mt-3 text-[15px] leading-snug text-muted">
        {n} startups each want SOC 2 software. Instead of {n} founders each calling sales, our AI agent negotiates once for all of them.
      </p>
    </header>
  );
}
