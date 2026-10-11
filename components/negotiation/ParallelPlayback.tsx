"use client";

// "Play recorded calls side by side": every vendor's REAL finished call (transcript turns + extracted quote, straight
// from GET /api/pool) is replayed at the same time on one shared clock. Turns appear at their recorded startMs; a
// lane's quote lands when its transcript ends. Nothing here is generated: no text, no number.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, PoolView } from "@/lib/contracts";
import { fmtMmSs, usdSeat } from "@/components/pool/format";
import { effectiveFor, type Lane } from "./derive";

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
  const ids = new Set(view.pool.memberOrderIds);
  const members = view.orders.filter((o) => ids.has(o.id));
  return lanes.map((l) => {
    const p = plan.find((x) => x.vendorId === l.vendor.id);
    if (!p?.call) return { ...l, call: null, quote: null, eff: null, eligible: false, status: "no_recording" as const, bestBefore: null };
    const landed = t >= p.endMs;
    const turns = p.call.transcriptTurns.filter((x) => x.startMs <= t);
    const quote = landed ? (view.quotes.find((q) => q.callId === p.call!.id) ?? null) : null;
    const eff = quote ? effectiveFor(quote, members, new Date(view.now)) : null;
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

/**
 * Real call audio (Dial recordings in /public/recordings/<vendorId>.m4a) kept in sync with the shared clock.
 * Only the focused lane is audible, so five simultaneous lines don't talk over each other.
 */
export function useCallAudio(vendorIds: string[], t: number, playing: boolean, speed: number, soundOn: boolean, focusedId: string | null, laneEndMs: Record<string, number>) {
  const els = useRef<Record<string, HTMLAudioElement>>({});
  useEffect(() => {
    for (const id of vendorIds) {
      if (!els.current[id]) {
        const a = new Audio(`/recordings/${id}.m4a`);
        a.preload = "auto";
        els.current[id] = a;
      }
    }
    return () => {
      for (const a of Object.values(els.current)) a.pause();
    };
  }, [vendorIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const [id, a] of Object.entries(els.current)) {
      const audible = soundOn && playing && id === focusedId && t < (laneEndMs[id] ?? 0);
      if (!audible) {
        if (!a.paused) a.pause();
        continue;
      }
      a.playbackRate = speed;
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      const target = t / 1000;
      if (Math.abs(a.currentTime - target) > 0.35) a.currentTime = target;
      if (a.paused) void a.play().catch(() => {});
    }
  }, [t, playing, speed, soundOn, focusedId, laneEndMs]);
}

function fmtOriginalTimes(plan: PlaybackLane[]): string {
  const times = plan.map((p) => p.originalAt).filter((x): x is string => !!x).sort();
  if (times.length === 0) return "times unknown";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = day(times[0]) === day(times[times.length - 1]);
  return sameDay ? `${day(times[0])}: ${times.map(clock).join(", ")}` : times.map((x) => `${day(x)} ${clock(x)}`).join(", ");
}

/** Transport controls for the call playback, with a small provenance note and a sound toggle. */
export function PlaybackBar({
  plan,
  speed,
  playing,
  t,
  total,
  soundOn,
  onToggleSound,
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
  soundOn: boolean;
  onToggleSound: () => void;
  onSpeed: (s: Speed) => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const done = total > 0 && t >= total;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2" role="region" aria-label="Call playback">
      <button
        type="button"
        onClick={onToggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? "Mute call audio" : "Play call audio"}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${soundOn ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-canvas"}`}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6v4h2.5l3.5 3V3L5 6H2.5z" />
          {soundOn ? <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" /> : <path d="M11 6l4 4M15 6l-4 4" />}
        </svg>
        {soundOn ? "Sound on" : "Sound off"}
      </button>
      <button
        type="button"
        onClick={playing ? onPause : done ? onRestart : onResume}
        className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink transition-colors hover:bg-canvas"
      >
        {playing ? "Pause" : done ? "Play again" : "Resume"}
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
      <span className="tabular text-xs text-muted" aria-label="Elapsed">
        {fmtMmSs(t)} / {fmtMmSs(total)}
      </span>
      <span className="ml-auto text-[11px] text-faint" data-testid="playback-label">
        Real Dial calls recorded {fmtOriginalTimes(plan)}
      </span>
      <button type="button" onClick={onClose} className="text-[11px] text-faint underline decoration-dotted underline-offset-2 hover:text-ink">
        Close
      </button>
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

