"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemandEvidence, PoolView } from "@/lib/contracts";
import { deleteJson, getJson, postJson } from "@/components/pool/api";
import Link from "next/link";
import { fmtAgo, fmtRemaining, usdSeat } from "@/components/pool/format";
import { withSavedRecordings } from "./recordings";
import CallWall, { isLive } from "./CallWall";
import { buildLanes, parseRun, poolFacts, rankLanes, type RunState } from "./derive";
import { buildNegotiationFixture, type NegotiationFixtureStage } from "./fixture";
import Leaderboard from "./Leaderboard";
import { buildPlaybackPlan, lanesAt, PlaybackBar, playableCount, totalMs, useCallAudio, usePlaybackClock } from "./ParallelPlayback";
import RatchetChart from "./RatchetChart";
import RunControls, { type RunMode } from "./RunControls";
import TimePanel from "./TimePanel";
import { PolicyDisclosure, type PersonaView, type VendorMode } from "./VendorLane";

const POOL_POLL_MS = 1500;
const RUN_POLL_MS = 2000;

function looksLikePoolView(v: unknown): v is PoolView {
  const o = v as Partial<PoolView> | null;
  return (
    !!o &&
    typeof o === "object" &&
    !!o.pool &&
    Array.isArray(o.orders) &&
    Array.isArray(o.calls) &&
    Array.isArray(o.quotes) &&
    Array.isArray(o.vendors) &&
    !!o.timeSaved &&
    !!o.evidence
  );
}

type PersonasPayload = { vendorMode: VendorMode; personas: PersonaView[] };

function parsePersonas(v: unknown): PersonasPayload | null {
  const o = v as Partial<PersonasPayload> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.personas)) return null;
  return {
    vendorMode: o.vendorMode === "human" ? "human" : "ai",
    personas: o.personas.filter((p) => !!p && typeof p.vendorId === "string" && !!p.privatePolicy),
  };
}

/** The first line of Call.instruction states the vendor mode ("vendor_mode=ai" | "vendor_mode=human"). */
function callVendorMode(instruction: string): VendorMode | null {
  const m = /vendor_mode=(ai|human)/.exec(instruction.split("\n", 1)[0] ?? "");
  return m ? (m[1] as VendorMode) : null;
}

type RunFetch = { kind: "ok"; run: RunState | null } | { kind: "missing" } | { kind: "error" };

async function fetchRun(): Promise<RunFetch> {
  try {
    const res = await fetch("/api/pool/negotiate-all", { cache: "no-store" });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", run: parseRun(await res.json()) };
  } catch {
    return { kind: "error" };
  }
}

export default function NegotiationClient() {
  const [view, setView] = useState<PoolView | null>(null);
  const [source, setSource] = useState<"live" | "fixture">("live");
  const [stale, setStale] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [runAvailable, setRunAvailable] = useState(true);
  const [personas, setPersonas] = useState<PersonasPayload | null>(null);
  const [pending, setPending] = useState<RunMode | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [runChecked, setRunChecked] = useState(false);
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const everLive = useRef(false);
  const forced = useRef(false);
  const autoplayHandled = useRef(false);
  const savedRecordings = useRef<unknown>(null);

  const refreshPool = useCallback(async () => {
    if (forced.current) return;
    try {
      const res = await fetch("/api/pool", { cache: "no-store" });
      if (!res.ok) throw new Error(`pool ${res.status}`);
      const json: unknown = await res.json();
      if (!looksLikePoolView(json)) throw new Error("unexpected pool shape");
      if (!savedRecordings.current && json.vendors.some((vendor) => !json.calls.some((call) => call.vendorId === vendor.id))) {
        try {
          const recordings = await fetch("/api/recordings", { cache: "force-cache" });
          if (recordings.ok) savedRecordings.current = await recordings.json();
        } catch {
          // A library outage must not hide the current pool or an active call.
        }
      }
      everLive.current = true;
      setView(withSavedRecordings(json, savedRecordings.current));
      setSource("live");
      setStale(false);
    } catch {
      if (everLive.current) {
        setStale(true);
      } else {
        const fx = buildNegotiationFixture("done");
        setView((prev) => prev ?? fx.view);
        setRun((prev) => prev ?? fx.run);
        setSource("fixture");
      }
    }
  }, []);

  const refreshRun = useCallback(async () => {
    if (forced.current) return;
    const r = await fetchRun();
    if (r.kind !== "error") setRunChecked(true);
    if (r.kind === "missing") {
      setRunAvailable(false);
      return;
    }
    setRunAvailable(true);
    if (r.kind === "ok" && r.run) setRun(r.run);
  }, []);

  const poolRef = useRef(refreshPool);
  const runRef = useRef(refreshRun);
  poolRef.current = refreshPool;
  runRef.current = refreshRun;

  useEffect(() => {
    const stage = new URLSearchParams(window.location.search).get("fixture");
    if (stage === "idle" || stage === "running" || stage === "done") {
      forced.current = true;
      const fx = buildNegotiationFixture(stage as NegotiationFixtureStage);
      setView(fx.view);
      setRun(fx.run);
      setSource("fixture");
      return;
    }
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = (fn: () => Promise<void>, ms: number) => {
      const tick = async () => {
        await fn();
        if (!stopped) timers.push(setTimeout(tick, ms));
      };
      void tick();
    };
    loop(() => poolRef.current(), POOL_POLL_MS);
    loop(() => runRef.current(), RUN_POLL_MS);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getJson("/api/vendors/personas").then((res) => {
      if (cancelled || !res.ok) return;
      const parsed = parsePersonas(res.data);
      if (parsed) setPersonas(parsed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Playback plan + shared clock. Hooks run before the early return below, so derive from a possibly-null view.
  const baseLanes = view ? buildLanes(view, run) : [];
  const plan = view && source === "live" ? buildPlaybackPlan(view, baseLanes) : [];
  const canPlayback = playableCount(plan) >= 1;
  const clock = usePlaybackClock(totalMs(plan));
  // Real call audio for the lane in focus (off until the viewer turns it on; browsers need a click to play sound).
  const [soundOn, setSoundOn] = useState(false);
  const planEndMs = Object.fromEntries(plan.map((p) => [p.vendorId, p.endMs]));
  useCallAudio(plan.filter((p) => p.call).map((p) => p.vendorId), clock.t, clock.playing, clock.speed, soundOn, joinedId, planEndMs);

  function startPlayback() {
    setPlaybackOpen(true);
    setJoinedId(null);
    clock.restart();
  }
  const startPlaybackRef = useRef(startPlayback);
  startPlaybackRef.current = startPlayback;

  // /negotiation?autoplay=1: no click needed. A live run already in progress is shown live instead.
  // With no finished calls in the DB yet, the real recordings are loaded first (a replay run), then played side by side.
  const startRunRef = useRef(startRun);
  startRunRef.current = startRun;
  const seededReplay = useRef(false);
  useEffect(() => {
    if (autoplayHandled.current || !view || source !== "live" || !runChecked) return;
    if (new URLSearchParams(window.location.search).get("autoplay") !== "1") {
      autoplayHandled.current = true;
      return;
    }
    if (run?.running) {
      if (!seededReplay.current) autoplayHandled.current = true; // a live run is already in progress: just show it live
      return;
    }
    if (canPlayback) {
      autoplayHandled.current = true;
      startPlaybackRef.current();
      return;
    }
    if (!seededReplay.current) {
      seededReplay.current = true;
      void startRunRef.current("replay");
    }
  }, [view, source, runChecked, run, canPlayback]);

  async function settlePool() {
    setSettleBusy(true);
    setSettleError(null);
    const res = await postJson("/api/pool/settle", {});
    setSettleBusy(false);
    if (!res.ok) {
      setSettleError(res.error);
      return;
    }
    void poolRef.current();
  }

  async function startRun(mode: RunMode) {
    setPending(mode);
    setRunError(null);
    setPlaybackOpen(false);
    setJoinedId(null);
    clock.stop();
    const res = await postJson("/api/pool/negotiate-all", mode === "parallel" ? { mode: "live", parallel: true } : { mode });
    setPending(null);
    if (!res.ok) {
      setRunError(res.error);
      return;
    }
    const parsed = parseRun(res.data);
    if (parsed) setRun(parsed);
    void runRef.current();
    void poolRef.current();
  }

  async function stopRun() {
    setStopping(true);
    setRunError(null);
    const res = await deleteJson("/api/pool/negotiate-all");
    setStopping(false);
    if (!res.ok) setRunError(res.error);
    else setRun(parseRun(res.data));
    void poolRef.current();
  }

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
        <p className="text-sm text-muted" role="status">
          Loading the negotiation room.
        </p>
      </main>
    );
  }

  const liveLanes = baseLanes;
  const facts = poolFacts(view);
  const running = !!run?.running;
  const showControls = source === "live" && runAvailable;
  const replaying = playbackOpen && !running;
  // During playback every lane is derived from the shared clock; otherwise the live DB state.
  const lanes = replaying ? lanesAt(view, liveLanes, plan, clock.t) : liveLanes;
  const ranked = rankLanes(lanes);
  const best = ranked[0]?.eligible ? ranked[0] : null;
  const liveRanked = rankLanes(liveLanes);
  const liveBest = liveRanked[0]?.eligible ? liveRanked[0] : null;
  const total = lanes.length;
  const liveCount = lanes.filter(isLive).length;
  const quoted = lanes.filter((l) => l.eligible).length;
  const anyCalling = liveCount > 0;
  // The run or replay is over.
  const runFinished = replaying ? clock.finished : !running && !anyCalling && (!!run?.finishedAt || lanes.some((l) => l.eligible));
  const started = replaying || running || lanes.some((l) => !!l.call);
  const bestCents = best?.eff?.effectiveCents ?? null;
  const lowestList = view.vendors.reduce((m, v) => Math.min(m, v.listPricePerSeatCents), Infinity);
  const listRef = Number.isFinite(lowestList) ? lowestList : 0;
  const deltaPct = bestCents != null && listRef > 0 ? Math.round((1 - bestCents / listRef) * 100) : 0;
  const statusLine = runFinished
    ? `All calls ended, ${quoted} ${quoted === 1 ? "quote" : "quotes"} from ${total} vendors`
    : replaying && !clock.playing
      ? "Replay paused"
      : started
        ? `${liveCount === 0 ? "No call" : liveCount === 1 ? "1 call" : `${liveCount} calls`} live, ${quoted} quoted`
        : "Waiting for the marketplace to dispatch the agents";
  const closesInMs = new Date(view.pool.windowClosesAt).getTime() - new Date(view.now).getTime();
  const closed = view.pool.status === "settled" || closesInMs <= 0;
  const settled = view.pool.status === "settled";
  const settleReady =
    source === "live" && !running && !replaying && !settled && runFinished && !!liveBest?.eff && !view.calls.some((c) => c.status !== "extracted" && c.status !== "failed");
  const replayEndMs = Object.fromEntries(plan.map((p) => [p.vendorId, p.endMs]));
  const settleLabel = settled ? "Pool settled" : liveBest?.eff ? `Settle pool at ${usdSeat(liveBest.eff.effectiveCents)}` : "Settle pool";

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-10 pt-7 sm:px-6">
      <section aria-label="Pool status" className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-medium text-muted">
            Best group price so far, SOC 2 seats
            {source === "fixture" && <span title="The pool API is unreachable, so this is local sample data. No real calls were made.">. Sample data, no real calls</span>}
            {source === "live" && stale && <span title="The last refresh failed. Showing the previous data.">. Reconnecting</span>}
          </p>
          <p className="m-0 mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 leading-none">
            <BestPrice cents={bestCents ?? listRef} />
            <span className="text-[15px] text-muted">
              {bestCents != null ? (
                <>
                  a seat. List from <span className="tabular line-through">{usdSeat(listRef)}</span>, {deltaPct}% below
                </>
              ) : (
                <>a seat at list. No quote yet</>
              )}
            </span>
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-end gap-2 text-right">
          <p className="m-0 flex items-center justify-end gap-2 text-[15px] font-medium" aria-live="polite">
            {anyCalling && (!replaying || clock.playing) && <span className="cw-live inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />}
            <span>{statusLine}</span>
          </p>
          <p className="tabular m-0 text-[13px] text-muted">
            {facts.seats} seats from {facts.startups} startups.{" "}
            {best?.eff ? `Every agent cites the offer in hand, ${usdSeat(best.eff.effectiveCents)} from ${best.vendor.name}.` : closed ? "Pooling window closed." : `Window closes in ${fmtRemaining(closesInMs)}.`}
          </p>
          {showControls && (
            <RunControls
              running={running}
              pending={pending}
              error={runError ?? (run?.error === "Stopped by user" ? null : run?.error ?? null)}
              parallelAvailable={run?.parallelAvailable === true}
              canPlayback={canPlayback}
              playbackOpen={replaying}
              onRun={startRun}
              onPlayback={startPlayback}
              onStop={stopRun}
              stopping={stopping}
              settled={settled}
            />
          )}
        </div>
      </section>

      {replaying && (
        <PlaybackBar
          plan={plan}
          speed={clock.speed}
          playing={clock.playing}
          t={clock.t}
          total={totalMs(plan)}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((v) => !v)}
          onSpeed={clock.setSpeed}
          onPause={clock.pause}
          onResume={clock.resume}
          onRestart={clock.restart}
          onClose={() => {
            clock.stop();
            setPlaybackOpen(false);
          }}
        />
      )}

      <CallWall
        lanes={lanes}
        replaying={replaying}
        replayClockMs={clock.t}
        replayEndMs={replayEndMs}
        running={running || (replaying && !clock.finished)}
        bestCents={bestCents}
        joinedId={joinedId}
        onJoin={setJoinedId}
      />

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[13px] text-muted">
            {settled
              ? "Pool settled. Final prices and cancellations are saved."
              : runFinished && liveBest?.eff
                ? `Settling applies ${usdSeat(liveBest.eff.effectiveCents)} to every pooled startup whose price cap allows it.`
                : "Settle unlocks when every call has ended."}{" "}
            <Link href="/pool" className="underline decoration-dotted underline-offset-2">
              See the settlement on the marketplace
            </Link>
          </p>
          {settleError && (
            <p role="alert" className="mt-2 max-w-xl break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
              {settleError}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!settleReady || settleBusy}
          onClick={() => void settlePool()}
          className="h-11 rounded-lg border-0 px-5 text-[14px] font-semibold text-white enabled:cursor-pointer enabled:bg-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {settleBusy ? "Settling" : settleLabel}
        </button>
      </footer>

      <p className="m-0 text-[12px] text-faint">All five are test vendors; calls are real Dial calls, one at a time.</p>

      <details className="border-t border-line pt-4">
        <summary className="cursor-pointer text-[13px] font-medium text-accent-strong">Details: leaderboard, price after each call, time back, vendor policies</summary>
        <div id="negotiation-details" className="mt-4">
          <dl className="flex flex-wrap gap-x-7 gap-y-2">
            <Fact value={String(facts.startups)} label="startups pooled" />
            <Fact value={String(facts.seats)} label="seats in the pool" />
            <Fact value={closed ? "Closed" : fmtRemaining(closesInMs)} label={closed ? "pooling window" : "until the window closes"} />
          </dl>
          <Leverage evidence={view.evidence} now={view.now} />
          <div className={`mt-4 grid gap-4 ${replaying ? "" : "lg:grid-cols-2"}`}>
            <Leaderboard lanes={lanes} facts={facts} running={replaying ? !clock.finished : running} />
            {!replaying && <RatchetChart lanes={lanes} />}
          </div>
          <div className="mt-4">
            <TimePanel view={view} vendorCount={lanes.length} />
          </div>
          {personas && personas.personas.length > 0 && (
            <section aria-label="Vendor pricing policies" className="mt-4">
              <h2 className="text-sm font-semibold">Each vendor&rsquo;s private pricing policy, hidden from our agent</h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lanes.map((l) => {
                  const persona = personas.personas.find((p) => p.vendorId === l.vendor.id);
                  if (!persona) return null;
                  const mode = (l.call && callVendorMode(l.call.instruction)) ?? personas.vendorMode ?? "ai";
                  return <PolicyDisclosure key={l.vendor.id} persona={persona} mode={mode} vendorName={l.vendor.name} />;
                })}
              </div>
            </section>
          )}
        </div>
      </details>
    </main>
  );
}

/** The 56px price. Flips only when the figure actually changes after first paint. */
function BestPrice({ cents }: { cents: number }) {
  const prev = useRef(cents);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (prev.current === cents) return;
    prev.current = cents;
    setFlip(true);
    const id = setTimeout(() => setFlip(false), 700);
    return () => clearTimeout(id);
  }, [cents]);
  return (
    <span className={`tabular text-[56px] font-semibold tracking-[-0.04em] text-ink ${flip ? "cw-price-new" : ""}`} data-testid="best-price">
      {usdSeat(cents)}
    </span>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <dd className="tabular text-[17px] font-semibold leading-tight tracking-tight">{value}</dd>
      <dt className="text-[11px] leading-snug text-muted">{label}</dt>
    </div>
  );
}

function Leverage({ evidence, now }: { evidence: DemandEvidence; now: string }) {
  const unavailable = evidence.source === "unavailable" || evidence.abandonedOverPrice90d == null || evidence.interestedBuyers90d == null;
  const provenance =
    evidence.source === "keewano_live" ? "Keewano, live" : evidence.source === "keewano_cached" ? `Keewano, cached ${fmtAgo(evidence.ranAt, now)}` : "Keewano, unavailable";
  return (
    <div className="mt-4 max-w-3xl rounded-lg border border-accent/25 bg-accent-soft/60 px-3 py-2 text-[13px] leading-snug">
      <span className="font-medium text-accent-strong">Leverage the agent cites: </span>
      {unavailable ? (
        <span className="text-muted">Keewano demand data is unavailable, so the agent negotiates without demand numbers.</span>
      ) : (
        <span>
          <span className="tabular font-semibold">{evidence.abandonedOverPrice90d}</span> of{" "}
          <span className="tabular font-semibold">{evidence.interestedBuyers90d}</span> startups that looked at SOC 2 software walked away over price in the last 90 days.
        </span>
      )}
      <span className="text-muted">
        {" "}
        {provenance}
        {evidence.isSyntheticHistory && !unavailable ? ", synthetic history" : ""}.
      </span>
    </div>
  );
}
