"use client";

import { usdSeat } from "@/components/pool/format";
import { Badge } from "@/components/pool/ui";
import type { Lane, PoolFacts } from "./derive";
import { rankLanes } from "./derive";

const ROW = 76; // px per row slot (row card is ROW - 8 tall)

function captionFor(l: Lane): string {
  if (l.status === "calling") return "On the phone now";
  if (l.status === "transcribing") return "Transcribing the call";
  if (l.status === "failed") return "Call failed, no quote";
  if (l.status === "no_recording") return "No recording to replay";
  if (l.status === "waiting") return "Not called yet";
  if (l.quote && l.quote.separateAccountsConfirmed !== true) return "Not ranked: no separate accounts";
  if (l.quote && !l.eff) return "No tier at this pool size";
  return "No quote";
}

export default function Leaderboard({ lanes, facts, running }: { lanes: Lane[]; facts: PoolFacts; running: boolean }) {
  const ranked = rankLanes(lanes);
  const quoted = lanes.filter((l) => l.eligible).length;
  const bestId = ranked[0]?.eligible && (ranked[0].eff?.effectiveCents ?? Infinity) < ranked[0].vendor.listPricePerSeatCents ? ranked[0].vendor.id : null;
  const final = !running && quoted > 0;

  return (
    <section aria-labelledby="lb-h" className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="lb-h" className="text-sm font-semibold">
          Leaderboard: effective price per seat
        </h2>
        <p className="tabular text-xs text-muted">
          at {facts.seats} pooled seats, {facts.startups} startups
        </p>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted">
        Tier price at the pool&rsquo;s size, plus each vendor&rsquo;s per-account fee spread over about {Math.round(facts.avgSeats)} seats per startup.
      </p>

      <ol className="relative mt-3" style={{ height: ranked.length * ROW }}>
        {ranked.map((l, rank) => {
          const best = l.vendor.id === bestId;
          const list = l.vendor.listPricePerSeatCents;
          const eff = l.eligible ? l.eff : null;
          const saving = eff ? list - eff.effectiveCents : 0;
          return (
            <li
              key={l.vendor.id}
              className="neg-row absolute inset-x-0 top-0"
              style={{ height: ROW, transform: `translateY(${rank * ROW}px)` }}
            >
              <div
                className={`grid h-[68px] grid-cols-[1fr_auto] items-center gap-3 rounded-lg border px-3 ${
                  best ? "border-accent/50 bg-accent-soft" : eff ? "border-line bg-surface" : "border-dashed border-line bg-canvas/50"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`text-[14px] font-semibold ${eff ? "" : "text-muted"}`}>{l.vendor.name}</span>
                    {best && <Badge tone="accent">{final ? "Best deal" : "Best so far"}</Badge>}
                  </div>
                  <p className="tabular mt-0.5 truncate text-[11.5px] text-muted">
                    {eff
                      ? `${usdSeat(eff.tierCents)} + ${usdSeat(Math.round(eff.feePerSeatCents))} fee`
                      : captionFor(l)}
                  </p>
                </div>
                <div className="text-right">
                  {eff ? (
                    <>
                      <div className="tabular text-[19px] font-semibold leading-tight tracking-tight">{usdSeat(eff.effectiveCents)}</div>
                      <div className="tabular text-[11.5px] leading-snug text-muted">
                        <s>{usdSeat(list)}</s>{" "}
                        {saving > 0 ? (
                          <span className="font-medium text-accent-strong">
                            save {usdSeat(saving)} ({Math.round((saving / list) * 100)}%)
                          </span>
                        ) : (
                          <span className="font-medium text-warn">not below list</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="tabular text-xs text-muted">
                      list {usdSeat(list)}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
