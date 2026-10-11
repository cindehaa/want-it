"use client";

import type { DemandEvidence } from "@/lib/contracts";
import { fmtAgo, usdSeat } from "./format";
import { Badge } from "./ui";

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="flex min-w-0 items-center gap-4 sm:block">
      <div className="tabular w-[136px] shrink-0 text-[36px] font-semibold leading-none tracking-[-0.04em] sm:w-auto sm:text-[48px]">{value}</div>
      <div className="min-w-0 sm:mt-2">
        <div className="text-[14px] font-medium leading-snug">{label}</div>
        <div className="text-[12px] leading-snug text-muted">{sub}</div>
      </div>
    </div>
  );
}

/** Badges that say where the numbers came from. Rendered in the step header. */
export function EvidenceBadges({ evidence, now }: { evidence: DemandEvidence; now: string }) {
  return (
    <>
      {evidence.source === "keewano_live" && <Badge tone="accent">Keewano live</Badge>}
      {evidence.source === "keewano_cached" && (
        <Badge tone="warn" title={evidence.ranAt ?? undefined}>
          Keewano cached, {fmtAgo(evidence.ranAt, now)}
        </Badge>
      )}
      {evidence.source === "unavailable" && <Badge tone="danger">Keewano unavailable</Badge>}
      {evidence.isSyntheticHistory && <Badge tone="neutral">Synthetic history</Badge>}
    </>
  );
}

export default function EvidenceCard({ evidence }: { evidence: DemandEvidence }) {
  const unavailable = evidence.source === "unavailable";
  const n = (v: number | null) => (v == null ? "n/a" : v.toLocaleString("en-US"));
  return (
    <div>
      {unavailable ? (
        <p className="text-[14px] text-muted">Keewano could not be reached. The agent can still negotiate, just without demand numbers.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-3">
            <Stat value={n(evidence.interestedBuyers90d)} label="wanted it" sub="interested buyers, last 90 days" />
            <Stat value={n(evidence.abandonedOverPrice90d)} label="walked away over price" sub="last 90 days" />
            <Stat
              value={evidence.medianMaxPricePerSeatCents == null ? "n/a" : `~${usdSeat(evidence.medianMaxPricePerSeatCents)}`}
              label="would pay per seat"
              sub="median of their max prices"
            />
          </div>
          <p className="mt-5 border-t border-line pt-4 text-[14px] text-muted">
            <span className="font-medium text-ink">This is what the agent tells vendors.</span> Real demand that left at list price is
            new revenue for them.
          </p>
        </>
      )}

      {evidence.queryText && (
        <details className="group mt-3">
          <summary className="cursor-pointer select-none text-xs text-muted hover:text-ink">Show the query</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-ink">
            {evidence.queryText}
          </pre>
        </details>
      )}
    </div>
  );
}
