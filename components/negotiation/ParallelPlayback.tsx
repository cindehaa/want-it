"use client";

// "Play recorded calls side by side": every vendor's REAL finished call (transcript turns + extracted quote, straight
// from GET /api/pool) is replayed at the same time on one shared clock. Turns appear at their recorded startMs; a
// lane's quote lands when its transcript ends. Nothing here is generated: no text, no number.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, PoolView } from "@/lib/contracts";
import { fmtMmSs, usdSeat } from "@/components/pool/format";
import { effectiveFor, poolFacts, type Lane } from "./derive";

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
export const DEFAULT_SPEED: Speed = 2;
const TAIL_MS = 2500; // a lane "hangs up" this long after its last recorded turn starts

export type PlaybackLane = {
  vendorId: string;
  call: Call | null; // the real call being replayed (null: nothing recorded for this vendor)
  endMs: number;
  originalAt: string | null; // when the call was originally placed
};

const isFinished = (c: Call) => c.status !== "queued" && c.status !== "in_progress" && c.transcriptTurns.length > 0;

/** Which real call each vendor lane replays: its earliest finished call with a quote, else its earliest finished call. */
export function buildPlaybackPlan(view: PoolView, lanes: Lane[]): PlaybackLane[] {
  return lanes.map((l) => {
    const mine = view.calls.filter((c) => c.vendorId === l.vendor.id && isFinished(c)).sort((a, b) => a.sequence - b.sequence);
    const call = mine.find((c) => view.quotes.some((q) => q.callId === c.id)) ?? mine[0] ?? null;
    if (!call) return { vendorId: l.vendor.id, call: null, endMs: 0, originalAt: null };
    const last = call.transcriptTurns.reduce((m, t) => Math.max(m, t.startMs), 0);
    return {
      vendorId: l.vendor.id,
      call,
      endMs: last + TAIL_MS,
      originalAt: call.source === "recorded_replay" ? call.recordedAt : call.startedAt,
    };
  });
}

export const playableCount = (plan: PlaybackLane[]) => plan.filter((p) => p.call).length;
export const totalMs = (plan: PlaybackLane[]) => plan.reduce((m, p) => Math.max(m, p.endMs), 0);

/** The lanes as they look at shared-clock time t: only turns already spoken, quote only once the call has ended. */
export function lanesAt(view: PoolView, lanes: Lane[], plan: PlaybackLane[], t: number): Lane[] {
  const facts = poolFacts(view);
  return lanes.map((l) => {
    const p = plan.find((x) => x.vendorId === l.vendor.id);
    if (!p?.call) return { ...l, call: null, quote: null, eff: null, eligible: false, status: "no_recording" as const, bestBefore: null };
    const landed = t >= p.endMs;
    const turns = p.call.transcriptTurns.filter((x) => x.startMs <= t);
    const quote = landed ? (view.quotes.find((q) => q.callId === p.call!.id) ?? null) : null;
    const eff = quote ? effectiveFor(quote, facts) : null;
    const eligible = !!quote && quote.separateAccountsConfirmed === true && !!eff;
    const status: Lane["status"] = !landed ? "calling" : quote ? "extracted" : p.call.status === "failed" ? "failed" : "extracted";
    return { ...l, call: { ...p.call, transcriptTurns: turns }, quote, eff, eligible, status, bestBefore: null };
  });
}

/** Shared playback clock (ms of call time), driven by requestAnimationFrame. */
export function usePlaybackClock(total: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<Speed>(DEFAULT_SPEED);
  const speedRef = useRef<Speed>(DEFAULT_SPEED);
  const tRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (nowMs: number) => {
      const dt = nowMs - last;
      last = nowMs;
      tRef.current = Math.min(total, tRef.current + dt * speedRef.current);
      setT(tRef.current);
      if (tRef.current >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  const setSpeed = useCallback((s: Speed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);
  const restart = useCallback(() => {
    tRef.current = 0;
    setT(0);
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const resume = useCallback(() => {
    if (tRef.current >= total) {
      tRef.current = 0;
      setT(0);
    }
    setPlaying(true);
  }, [total]);
  const stop = useCallback(() => {
    setPlaying(false);
    tRef.current = 0;
    setT(0);
  }, []);
  return { t, playing, speed, setSpeed, restart, pause, resume, stop, finished: total > 0 && t >= total };
}

function fmtOriginalTimes(plan: PlaybackLane[]): string {
  const times = plan.map((p) => p.originalAt).filter((x): x is string => !!x).sort();
  if (times.length === 0) return "times unknown";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = day(times[0]) === day(times[times.length - 1]);
  return sameDay ? `${day(times[0])}: ${times.map(clock).join(", ")}` : times.map((x) => `${day(x)} ${clock(x)}`).join(", ");
}

/** Persistent honesty label + transport controls for the side-by-side replay. */
export function PlaybackBar({
  plan,
  speed,
  playing,
  t,
  total,
  onSpeed,
  onPause,
  onResume,
  onRestart,
  onClose,
}: {
  plan: PlaybackLane[];
  speed: Speed;
  playing: boolean;
  t: number;
  total: number;
  onSpeed: (s: Speed) => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const done = total > 0 && t >= total;
  return (
    <div className="mt-5 rounded-xl border border-warn/40 bg-warn-soft/60 p-3 sm:p-4" role="region" aria-label="Recorded call playback">
      <p className="text-[13px] font-semibold leading-snug text-warn" data-testid="playback-label">
        Replaying real recorded Dial calls side by side (originally placed one after another at {fmtOriginalTimes(plan)}) · {speed}× speed
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={playing ? onPause : done ? onRestart : onResume}
          className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-xs font-medium text-white transition-colors hover:bg-ink/85"
        >
          {playing ? "Pause" : done ? "Replay again" : "Resume"}
        </button>
        <div role="group" aria-label="Playback speed" className="inline-flex overflow-hidden rounded-md border border-line bg-surface text-xs font-medium">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => onSpeed(s)}
              className={`h-8 px-3 transition-colors ${speed === s ? "bg-ink text-white" : "text-ink hover:bg-canvas"}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <button type="button" onClick={onRestart} className="h-8 rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-canvas">
          Restart
        </button>
        <span className="tabular text-xs text-muted" aria-label="Shared clock">
          {fmtMmSs(t)} / {fmtMmSs(total)}
        </span>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink">
          Close replay
        </button>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full bg-warn transition-[width] duration-100" style={{ width: `${total > 0 ? Math.min(100, (t / total) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

/** Shown once the replay or run has finished: the best deal, prominently. */
export function BestDealBanner({ best, vendorCount, replay }: { best: Lane; vendorCount: number; replay: boolean }) {
  if (!best.eff) return null;
  const list = best.vendor.listPricePerSeatCents;
  const saving = list - best.eff.effectiveCents;
  return (
    <section aria-label="Best deal" className="mt-5 rounded-xl border-2 border-accent bg-accent-soft p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">Best deal{replay ? " from the recorded calls" : ""}</p>
      <p className="mt-1 text-[22px] font-semibold leading-tight tracking-tight">
        {best.vendor.name} at <span className="tabular">{usdSeat(best.eff.effectiveCents)}</span> per seat all-in
        {saving > 0 && <span className="text-[15px] font-medium text-accent-strong"> (list {usdSeat(list)}, save {usdSeat(saving)})</span>}
      </p>
      <p className="mt-1.5 text-sm">
        <span className="font-medium">Applied automatically to every buyer under their max price.</span>{" "}
        <span className="text-muted">Best of {vendorCount} vendors. Anyone whose own cap is below it is not charged.</span>
      </p>
    </section>
  );
}

