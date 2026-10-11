"use client";

import type { PoolView } from "@/lib/contracts";
import { fmtDuration } from "@/components/pool/format";
import { Badge } from "@/components/pool/ui";
import { callMinutes, humanBaseline } from "./derive";

export default function TimePanel({ view, vendorCount }: { view: PoolView; vendorCount: number }) {
  const startups = view.pool.memberOrderIds.length;
  const calls = view.calls.filter((c) => c.status !== "failed");
  const agentMin = calls.reduce((s, c) => s + callMinutes(c, view.now), 0);
  const base = humanBaseline();
  const humanMin = startups * vendorCount * base.perVendorMinutes;
  const pct = humanMin > 0 ? Math.max(0.6, Math.min(100, (agentMin / humanMin) * 100)) : 0;

  return (
    <section aria-labelledby="time-h" className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="time-h" className="text-sm font-semibold">
          Time back
        </h2>
        {base.isEstimate && (
          <Badge tone="warn" title="Assumptions in data/benchmark.json, not a measured human baseline.">
            estimate
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">With want-it, the agent made</p>
          <p className="tabular mt-1 text-[26px] font-semibold leading-tight tracking-tight">
            {calls.length} {calls.length === 1 ? "call" : "calls"}
            <span className="ml-2 text-base font-medium text-muted">{agentMin < 1 && calls.length > 0 ? "under 1 min" : fmtDuration(agentMin)} of agent time</span>
          </p>
          <p className="mt-1 text-xs leading-snug text-muted">Agent time is machine time. It is not counted as human time saved.</p>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-muted">Without want-it, the founders would spend</p>
          <p className="tabular mt-1 text-[26px] font-semibold leading-tight tracking-tight">
            {fmtDuration(humanMin)}
            <span className="ml-2 text-base font-medium text-muted">of human time (estimate)</span>
          </p>
          <p className="tabular mt-1 text-xs leading-snug text-muted">
            {startups} startups &times; {vendorCount} vendors &times; {base.perVendorMinutes} min
          </p>
        </div>
      </div>

      <div className="mt-4" aria-hidden>
        <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
          <div className="h-full rounded-full bg-accent transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Estimate per startup per vendor: {base.steps.map((s) => `${s.label.toLowerCase()} ${s.minutes} min`).join(", ")}. Human time here is what buyers did not spend. It leaves out
        waiting for replies and scheduling. Illustrative, from data/benchmark.json.
      </p>
    </section>
  );
}
