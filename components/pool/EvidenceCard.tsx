"use client";

import type { DemandEvidence } from "@/lib/contracts";
import { fmtAgo, usdSeat } from "./format";
import { Badge } from "./ui";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="tabular text-xl font-semibold leading-tight tracking-tight">{value}</div>
      <div className="text-[11px] leading-snug text-muted">{label}</div>
    </div>
  );
}

export default function EvidenceCard({ evidence, now }: { evidence: DemandEvidence; now: string }) {
  const unavailable = evidence.source === "unavailable";
  const n = (v: number | null) => (v == null ? "n/a" : v.toLocaleString("en-US"));
  return (
    <section aria-labelledby="evidence-h" className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="evidence-h" className="text-sm font-semibold">
          Demand evidence from Keewano
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {evidence.source === "keewano_live" && <Badge tone="accent">Live</Badge>}
          {evidence.source === "keewano_cached" && (
            <Badge tone="warn" title={evidence.ranAt ?? undefined}>
              Cached, {fmtAgo(evidence.ranAt, now)}
            </Badge>
          )}
          {unavailable && <Badge tone="danger">Unavailable</Badge>}
          {evidence.isSyntheticHistory && <Badge tone="neutral">Synthetic history</Badge>}
        </div>
      </div>

      {unavailable ? (
        <p className="mt-2 text-[13px] text-muted">
          Keewano could not be reached. The agent can still negotiate, just without demand numbers.
        </p>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-ink">{evidence.summary}</p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat value={n(evidence.interestedBuyers90d)} label="interested buyers, 90 days" />
        <Stat value={n(evidence.abandonedOverPrice90d)} label="left over price, 90 days" />
        <Stat
          value={evidence.medianMaxPricePerSeatCents == null ? "n/a" : usdSeat(evidence.medianMaxPricePerSeatCents)}
          label="median max price per seat"
        />
      </div>

      {evidence.queryText && (
        <details className="group mt-3">
          <summary className="cursor-pointer select-none text-xs text-muted hover:text-ink">Show the query</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-ink">
            {evidence.queryText}
          </pre>
        </details>
      )}
    </section>
  );
}
