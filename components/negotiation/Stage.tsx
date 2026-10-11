"use client";

// "Stage" first screen (docs/design/Main.dc.html): best price, vendor rail, ONE focused live call, what the agent cites,
// price sparkline, one Settle button. Everything is derived from real calls/quotes/evidence passed in; nothing is sample data.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemandEvidence } from "@/lib/contracts";
import { fmtAgo, fmtMmSs, usdSeat } from "@/components/pool/format";
import { rankLanes, type Lane, type PoolFacts } from "./derive";
import { isAgent } from "./VendorLane";

export type StagePhase = "idle" | "running" | "finished";

export type StageSettle = {
  disabled: boolean;
  busy: boolean;
  settled: boolean;
  label: string; // e.g. "Settle pool at $18.50"
  error: string | null;
  onClick: () => void;
};

const C = { canvas: "#f4f5f6", surface: "#ffffff", ink: "#12171c", muted: "#5f6a75", faint: "#8f98a2", line: "#e1e4e8", green: "#059669", greenInk: "#047857", greenSoft: "#e7f6ef", amber: "#a16207", amberSoft: "#fbf1d9" };

const isActive = (l: Lane) => !!l.call && (l.status === "calling" || l.status === "transcribing");

type Props = {
  lanes: Lane[]; // display lanes: live DB state, or the replay state at the shared clock
  facts: PoolFacts;
  evidence: DemandEvidence;
  now: string;
  windowText: string; // "2d 23h" or "closed"
  phase: StagePhase;
  replaying: boolean;
  replayPlaying: boolean;
  replayClockMs: number;
  replayEndMs: Record<string, number>; // vendorId -> when its recorded call ends on the shared clock
  onFocusChange?: (vendorId: string | null) => void; // the lane whose audio should be heard
  parallel: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  settle: StageSettle;
};

export default function Stage({ lanes, facts, evidence, now, windowText, phase, replaying, replayPlaying, replayClockMs, replayEndMs, parallel, detailsOpen, onToggleDetails, settle, onFocusChange }: Props) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const anyActive = lanes.some(isActive);
  useEffect(() => {
    if (!anyActive || replaying) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyActive, replaying]);
  // A new replay or run releases a pinned lane.
  useEffect(() => {
    if (phase === "running" && replaying && replayClockMs === 0) setPinnedId(null);
  }, [phase, replaying, replayClockMs]);

  const total = lanes.length;
  const ranked = rankLanes(lanes);
  const bestLane = ranked[0]?.eligible && (ranked[0].eff?.effectiveCents ?? Infinity) < ranked[0].vendor.listPricePerSeatCents ? ranked[0] : null;
  const refList = 3000; // the reference list price buyers saw at checkout (same anchor as the storefront)
  const bestCents = bestLane?.eff?.effectiveCents ?? null;
  const price = bestCents != null ? usdSeat(bestCents) : "—"; // no supplier-stated quote has landed yet
  const deltaPct = bestCents != null ? Math.round((1 - bestCents / refList) * 100) : 0;

  // ---- focus: most recently speaking active lane, unless the viewer pinned one
  const spokeAt = (l: Lane): number => {
    const turns = l.call?.transcriptTurns ?? [];
    if (!l.call || turns.length === 0) return -1;
    const last = turns[turns.length - 1].startMs;
    return replaying ? last : new Date(l.call.startedAt).getTime() + last;
  };
  const pickLatest = (cands: Lane[]) => cands.reduce<Lane | null>((m, l) => (!m || spokeAt(l) > spokeAt(m) ? l : m), null);
  const active = lanes.filter(isActive);
  const auto = pickLatest(active) ?? pickLatest(lanes.filter((l) => !!l.call)) ?? lanes[0] ?? null;
  const focus = (pinnedId && lanes.find((l) => l.vendor.id === pinnedId)) || auto;
  const focusId = focus?.vendor.id ?? null;
  useEffect(() => {
    onFocusChange?.(focusId);
  }, [focusId, onFocusChange]);

  const completed = lanes.filter((l) => l.status === "extracted" || l.status === "failed" || l.status === "no_recording").length;
  const railPct = total > 0 ? Math.min(100, ((completed + (active.length > 0 ? 0.5 : 0)) / total) * 100) : 0;

  const quotes = lanes.filter((l) => l.eligible).length;
  const callIndex = (l: Lane) => l.index + 1;
  const statusLine =
    phase === "finished"
      ? `Run finished, ${quotes} ${quotes === 1 ? "quote" : "quotes"} from ${total} vendors`
      : phase === "running"
        ? replaying
          ? replayPlaying
            ? `On the phone with ${active.length} ${active.length === 1 ? "vendor" : "vendors"}`
            : "Replay paused"
          : active.length > 1 || parallel
            ? `On the phone with ${active.length} vendors at once`
            : focus
              ? `On the phone with ${focus.vendor.name}, call ${callIndex(focus)} of ${total}`
              : "Starting the run"
        : "Waiting for the marketplace to dispatch the agents";
  const showLiveDot = phase === "running" && (!replaying || replayPlaying);

  // ---- elapsed clock of the focused call
  const elapsed = (l: Lane): number => {
    if (!l.call) return 0;
    if (replaying) return Math.min(replayClockMs, replayEndMs[l.vendor.id] ?? 0);
    if (isActive(l)) return Math.max(0, tickNow - new Date(l.call.startedAt).getTime());
    if (l.call.source === "live" && l.call.endedAt) return Math.max(0, new Date(l.call.endedAt).getTime() - new Date(l.call.startedAt).getTime());
    return l.call.transcriptTurns.reduce((m, t) => Math.max(m, t.startMs), 0);
  };
  const focusActive = !!focus && isActive(focus) && (!replaying || replayPlaying);
  const clockText = focus
    ? `${fmtMmSs(elapsed(focus))}${focus.status === "transcribing" ? ", transcribing" : !isActive(focus) && focus.call ? ", ended" : ""}`
    : "0:00";
  const callTitle = focus ? `${focus.vendor.name}, ${replaying || parallel ? "line" : "call"} ${callIndex(focus)} of ${total}${!isActive(focus) && focus.call ? ", ended" : ""}` : "No call yet";

  const turns = (focus?.call?.transcriptTurns ?? []).slice(-3);
  const turnsOffset = (focus?.call?.transcriptTurns.length ?? 0) - turns.length;
  const emptyText = !focus
    ? "The agents have not been dispatched yet."
    : focus.status === "failed"
      ? `Call failed${focus.call?.error ? `: ${focus.call.error}` : "."} No quote from this call.`
      : focus.status === "no_recording"
        ? `No recorded call exists for ${focus.vendor.name}, so there is nothing to replay.`
        : focus.status === "waiting"
          ? `${focus.vendor.name} has not been called yet.`
          : focus.status === "transcribing"
            ? "Call ended. Waiting for the transcript."
            : `Dialing ${focus.vendor.name}. Turns appear here as the call is transcribed.`;

  // ---- "What the agent is citing": offer in hand + Keewano
  const inHand = (() => {
    if (!focus) return null;
    if (replaying) return null;
    const round2 = /round 2/i.test((focus.call?.instruction ?? "").split("\n", 1)[0] ?? "");
    const pool = parallel && !round2 ? [] : parallel ? lanes.filter((l) => l.vendor.id !== focus.vendor.id) : lanes.filter((l) => l.index < focus.index);
    const b = rankLanes(pool)[0];
    return b?.eligible && b.eff ? { cents: b.eff.effectiveCents, name: b.vendor.name } : null;
  })();
  const evUnavailable = evidence.source === "unavailable" || evidence.abandonedOverPrice90d == null || evidence.interestedBuyers90d == null;

  // ---- sparkline: best price after each call landed (replay: in the order they land on the clock)
  const landed = lanes
    .filter((l) => l.status === "extracted" || l.status === "failed" || l.status === "no_recording")
    .sort((a, b) => (replaying ? (replayEndMs[a.vendor.id] ?? 0) - (replayEndMs[b.vendor.id] ?? 0) : a.index - b.index));
  const series = [refList / 100];
  let run = refList;
  for (const l of landed) {
    if (l.eligible && l.eff) run = Math.min(run, l.eff.effectiveCents);
    series.push(run / 100);
  }
  const lo = Math.min(...series) - 0.5;
  const hi = Math.max(...series) + 0.5;
  const sx = (i: number) => (i * 300) / Math.max(1, total);
  const sy = (v: number) => 8 + ((hi - v) / Math.max(0.01, hi - lo)) * 52;
  const pts = series.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const lastX = sx(series.length - 1).toFixed(1);
  const lastY = sy(series[series.length - 1]).toFixed(1);

  const railNode = (l: Lane) => {
    const isBest = bestLane?.vendor.id === l.vendor.id;
    const calling = isActive(l);
    const done = l.status === "extracted" || l.status === "failed" || l.status === "no_recording";
    const value = isBest && l.eff ? `best, ${usdSeat(l.eff.effectiveCents)}` : calling ? "on the phone" : l.eligible && l.eff ? usdSeat(l.eff.effectiveCents) : l.status === "failed" ? "call failed" : l.status === "no_recording" ? "no recording" : done ? "no usable quote" : "waiting";
    return {
      cls: calling ? "node--calling" : "",
      dotBg: isBest ? C.green : done ? C.surface : calling ? C.amberSoft : C.canvas,
      dotBorder: isBest ? C.green : done ? C.green : calling ? C.amber : C.line,
      nameColor: !done && !calling ? C.faint : C.ink,
      valueColor: isBest ? C.greenInk : calling ? C.amber : !done ? C.faint : C.muted,
      value,
    };
  };

  return (
    <div className="stage-root flex flex-col gap-7">
      <section aria-label="Best group price" className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-medium" style={{ color: C.muted }}>
            Best group price so far for SOC 2 seats
          </p>
          <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 leading-none">
            <span key={price} className={`tnum text-[56px] font-semibold tracking-[-0.04em] sm:text-[72px] ${bestCents != null ? "price--new" : ""}`} data-testid="best-price">
              {price}
            </span>
            <span className="text-[20px]" style={{ color: C.muted }}>
              per seat
            </span>
            <span className="tnum text-[16px] line-through" style={{ color: C.faint }}>
              {usdSeat(refList)} list
            </span>
            {deltaPct > 0 && (
              <span className="tnum rounded-[5px] px-[7px] py-[3px] text-[13px] font-semibold" style={{ color: C.greenInk, background: C.greenSoft }}>
                -{deltaPct}%
              </span>
            )}
          </p>
          {phase === "finished" && bestLane && (
            <p className="m-0 mt-3 text-[14px] font-medium" style={{ color: C.greenInk }}>
              Best eligible offer: {bestLane.vendor.name}. Settlement checks each buyer&apos;s cap and the final vendor volume.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <p className="m-0 flex items-center gap-2 text-[15px] font-medium" aria-live="polite">
            {showLiveDot && <span className="live-dot inline-block h-2 w-2 rounded-full" aria-hidden style={{ background: C.green }} />}
            <span>{statusLine}</span>
          </p>
          <p className="tnum m-0 text-[13px]" style={{ color: C.muted }}>
            {facts.seats} seats from {facts.startups} startups, window closes in {windowText}
          </p>
        </div>
      </section>

      <section aria-label="Vendors called" className="flex flex-col gap-2.5">
        <div aria-hidden className="relative mx-10 h-0.5 rounded-sm" style={{ background: C.line }}>
          <div className="rail-fill absolute left-0 top-0 h-0.5 rounded-sm" style={{ background: C.green, width: `${railPct}%` }} />
        </div>
        <ol className="m-0 grid list-none gap-3 p-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, total)}, minmax(0, 1fr))` }}>
          {lanes.map((l) => {
            const n = railNode(l);
            const focused = focus?.vendor.id === l.vendor.id;
            return (
              <li key={l.vendor.id} className={`node ${n.cls}`}>
                <button
                  type="button"
                  onClick={() => setPinnedId((p) => (p === l.vendor.id ? null : l.vendor.id))}
                  aria-pressed={pinnedId === l.vendor.id}
                  aria-label={`${l.vendor.name}: ${n.value}. ${pinnedId === l.vendor.id ? "Pinned, click to follow the live call" : "Show this call"}`}
                  className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md border-0 bg-transparent p-0 pb-1 text-center"
                >
                  <span className="node-dot mt-[-18px] box-border h-3.5 w-3.5 rounded-full border-2" aria-hidden style={{ background: n.dotBg, borderColor: n.dotBorder, outline: focused ? `2px solid ${C.ink}` : undefined, outlineOffset: 2 }} />
                  <span className="text-[14px] font-semibold" style={{ color: n.nameColor }}>
                    {l.vendor.name}
                  </span>
                  <span className="tnum text-[13px]" style={{ color: n.valueColor }}>
                    {n.value}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Live call" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-h-[360px] flex-col gap-[18px] rounded-xl border px-5 py-6 sm:px-7" style={{ background: C.surface, borderColor: C.line }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
              {callTitle}
              {pinnedId && (
                <button type="button" onClick={() => setPinnedId(null)} className="rounded border-0 bg-transparent p-0 text-[12px] font-medium underline decoration-dotted underline-offset-2" style={{ color: C.muted }}>
                  pinned, follow live call
                </button>
              )}
            </h2>
            <span className="tnum stage-mono text-[13px]" style={{ color: C.muted }} aria-label="Call clock">
              {clockText}
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-3.5" aria-live="polite">
            {turns.length === 0 ? (
              <p className="m-0 text-[15px]" style={{ color: C.muted }}>
                {emptyText}
              </p>
            ) : (
              turns.map((t, i) => {
                const isLast = i === turns.length - 1;
                const agent = isAgent(t.speaker);
                const speaking = isLast && focusActive;
                return (
                  <div key={`${focus?.call?.id}-${turnsOffset + i}`} className={`flex flex-col gap-1 ${agent ? "items-end" : "items-start"} ${isLast && focusActive ? "turn--new" : ""}`}>
                    <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: C.muted }}>
                      {agent ? "want-it agent" : (focus?.vendor.name ?? "Vendor")}
                      {speaking && (
                        <span className="wave inline-flex h-3.5 items-end gap-0.5" aria-hidden>
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                      )}
                    </span>
                    <p className="m-0 max-w-[85%] break-words rounded-[10px] px-3.5 py-2.5 leading-[1.4]" style={{ fontSize: isLast ? 17 : 14, background: agent ? C.greenSoft : C.canvas, color: C.ink }}>
                      {t.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-3 rounded-xl border px-5 py-[18px]" style={{ background: C.surface, borderColor: C.line }}>
            <h2 className="m-0 text-[13px] font-medium" style={{ color: C.muted }}>
              What the agent is citing
            </h2>
            <p className="m-0 text-[15px] leading-[1.4]">
              {replaying ? "Best landed so far " : "Offer in hand "}
              <strong className="tnum">
                {replaying
                  ? bestLane?.eff
                    ? `${usdSeat(bestLane.eff.effectiveCents)}, ${bestLane.vendor.name}`
                    : "none yet"
                  : inHand
                    ? `${usdSeat(inHand.cents)}, ${inHand.name}`
                    : "none yet"}
              </strong>
            </p>
            {evUnavailable ? (
              <p className="m-0 text-[15px] leading-[1.4]" style={{ color: C.muted }}>
                Keewano demand data is unavailable, so the agent negotiates without demand numbers.
              </p>
            ) : (
              <p className="m-0 text-[15px] leading-[1.4]">
                <strong className="tnum">
                  {evidence.abandonedOverPrice90d} of {evidence.interestedBuyers90d}
                </strong>{" "}
                startups walked away over price in 90 days
              </p>
            )}
            <p className="m-0 text-[12px]" style={{ color: C.muted }}>
              {evidence.source === "keewano_live" ? "Keewano, live" : evidence.source === "keewano_cached" ? `Keewano, cached ${fmtAgo(evidence.ranAt, now)}` : "Keewano, unavailable"}
              {evidence.isSyntheticHistory && !evUnavailable ? ", synthetic history" : ""}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border px-5 py-[18px]" style={{ background: C.surface, borderColor: C.line }}>
            <h2 className="m-0 text-[13px] font-medium" style={{ color: C.muted }}>
              Price after each call
            </h2>
            <svg viewBox="0 0 300 64" width="100%" height="64" role="img" aria-label="Best price per seat after each call, stepping down from list" style={{ display: "block", overflow: "visible" }}>
              <line x1="0" y1="8" x2="300" y2="8" stroke={C.line} strokeDasharray="4 4" />
              <polyline points={pts} fill="none" stroke={C.green} strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx={lastX} cy={lastY} r="4" fill={C.green} stroke="#ffffff" strokeWidth="2" />
            </svg>
            <p className="tnum m-0 text-[12px]" style={{ color: C.muted }}>
              From {usdSeat(refList)} list to {price}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleDetails}
            aria-expanded={detailsOpen}
            aria-controls="negotiation-details"
            className="cursor-pointer self-start border-0 bg-transparent p-0 py-0.5 text-left text-[13px] font-medium underline-offset-2 hover:underline"
            style={{ color: C.greenInk }}
          >
            {detailsOpen ? "Hide details" : "Details: transcripts, quotes, vendor policies"}
          </button>
        </aside>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="min-w-0">
          <p className="m-0 text-[13px]" style={{ color: C.muted }}>
            {settle.settled
              ? "Pool settled. Final prices and cancellations are saved. Buyers with deals have test account links."
              : phase === "finished" && bestCents != null
                ? `Settling applies ${usdSeat(bestCents)} to every pooled startup whose price cap allows it.`
                : "Settle is available when the last call ends."}{" "}
            <Link href="/pool" className="underline decoration-dotted underline-offset-2" style={{ color: C.muted }}>
              See the settlement on the marketplace
            </Link>
          </p>
          {settle.error && (
            <p role="alert" className="mt-2 max-w-xl break-words rounded-md border px-2.5 py-1.5 text-xs" style={{ color: "#dc2626", background: "#fdecec", borderColor: "rgba(220,38,38,.3)" }}>
              {settle.error}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={settle.disabled}
          onClick={settle.onClick}
          className="h-11 cursor-pointer rounded-lg border-0 px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed"
          style={{ background: settle.disabled ? "#b9c0c7" : C.ink }}
        >
          {settle.busy ? "Settling…" : settle.label}
        </button>
      </footer>
    </div>
  );
}
