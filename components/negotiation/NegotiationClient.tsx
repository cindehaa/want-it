"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DemandEvidence, PoolView } from "@/lib/contracts";
import { deleteJson, getJson, postJson } from "@/components/pool/api";
import { fmtAgo, fmtRemaining, usdSeat } from "@/components/pool/format";
import { Badge, Spinner } from "@/components/pool/ui";
import { buildLanes, parseRun, poolFacts, rankLanes, type Lane, type RunState } from "./derive";
import { buildNegotiationFixture, type NegotiationFixtureStage } from "./fixture";
import Leaderboard from "./Leaderboard";
import RatchetChart from "./RatchetChart";
import RunControls, { type RunMode } from "./RunControls";
import TimePanel from "./TimePanel";
import VendorLane, { type PersonaView, type VendorMode } from "./VendorLane";

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
  const everLive = useRef(false);
  const forced = useRef(false);

  const refreshPool = useCallback(async () => {
    if (forced.current) return;
    try {
      const res = await fetch("/api/pool", { cache: "no-store" });
      if (!res.ok) throw new Error(`pool ${res.status}`);
      const json: unknown = await res.json();
      if (!looksLikePoolView(json)) throw new Error("unexpected pool shape");
      everLive.current = true;
      setView(json);
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

  async function startRun(mode: RunMode) {
    setPending(mode);
    setRunError(null);
    const res = await postJson("/api/pool/negotiate-all", { mode });
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
      <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <p className="text-sm text-muted" role="status">
          Loading the negotiation room…
        </p>
      </main>
    );
  }

  const lanes = buildLanes(view, run);
  const facts = poolFacts(view);
  const running = !!run?.running;
  const showControls = source === "live" && runAvailable;
  const ranked = rankLanes(lanes);
  const best = ranked[0]?.eligible ? ranked[0] : null;
  const firstWaiting = lanes.find((l) => l.status === "waiting");
  const closesInMs = new Date(view.pool.windowClosesAt).getTime() - new Date(view.now).getTime();
  const closed = view.pool.status === "settled" || closesInMs <= 0;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-14 pt-5 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Negotiation room</h1>
            {source === "fixture" && (
              <Badge tone="warn" title="The pool API is unreachable, so this is local sample data. No real calls were made.">
                fixture data
              </Badge>
            )}
            {source === "live" && stale && (
              <Badge tone="danger" title="The last refresh failed. Showing the previous data.">
                reconnecting
              </Badge>
            )}
            <RunBadge run={run} lanes={lanes} />
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Our agent phones {lanes.length} test vendors one after another, each call citing the best offer so far.
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
            <Fact value={String(facts.startups)} label="startups pooled" />
            <Fact value={String(facts.seats)} label="seats in the pool" />
            <Fact value={closed ? "Closed" : fmtRemaining(closesInMs)} label={closed ? "pooling window" : "until the window closes"} />
          </dl>
          <Leverage evidence={view.evidence} now={view.now} />
        </div>
        {showControls && <RunControls running={running} pending={pending} error={runError ?? (run?.error === "Stopped by user" ? null : run?.error ?? null)} onRun={startRun} onStop={stopRun} stopping={stopping} settled={view.pool.status === "settled"} />}
      </div>

      <section aria-label="Vendor calls" className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {lanes.map((l) => {
          const active = l.status === "calling" || l.status === "transcribing";
          const mode = (l.call && callVendorMode(l.call.instruction)) ?? personas?.vendorMode ?? "ai";
          const hint =
            running && l.status === "waiting"
              ? firstWaiting?.vendor.id === l.vendor.id
                ? "Next up. The call starts when the current one ends."
                : "Waiting for earlier calls to finish."
              : null;
          return (
            <VendorLane
              key={l.vendor.id}
              lane={l}
              facts={facts}
              persona={personas?.personas.find((p) => p.vendorId === l.vendor.id)}
              mode={mode}
              active={active}
              runningHint={hint}
            />
          );
        })}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Leaderboard lanes={lanes} facts={facts} running={running} />
        <RatchetChart lanes={lanes} />
      </div>

      <div className="mt-4">
        <TimePanel view={view} vendorCount={lanes.length} />
      </div>

      <SettleFooter view={view} best={best} running={running} live={source === "live"} onSettled={() => void poolRef.current()} />
    </main>
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

function RunBadge({ run, lanes }: { run: RunState | null; lanes: Lane[] }) {
  if (!run) return null;
  if (run.running) {
    const current = lanes.find((l) => l.status === "calling" || l.status === "transcribing") ?? lanes.find((l) => l.status === "waiting");
    return (
      <Badge tone="warn">
        <Spinner />
        {run.mode === "replay" ? "Replaying" : "Running"}
        {current ? `: ${current.vendor.name}, ${current.index + 1} of ${lanes.length}` : ""}
      </Badge>
    );
  }
  if (run.finishedAt) {
    if (run.error) return <Badge tone="warn">{run.error === "Stopped by user" ? "Run stopped" : "Run failed"}</Badge>;
    const got = lanes.filter((l) => l.eligible).length;
    return <Badge tone="accent">Run finished: {got} of {lanes.length} quotes</Badge>;
  }
  return null;
}

function Leverage({ evidence, now }: { evidence: DemandEvidence; now: string }) {
  const unavailable = evidence.source === "unavailable" || evidence.abandonedOverPrice90d == null || evidence.interestedBuyers90d == null;
  return (
    <div className="mt-4 flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-accent/25 bg-accent-soft/60 px-3 py-2 text-[13px] leading-snug">
      <span className="font-medium text-accent-strong">Leverage the agent cites:</span>
      {unavailable ? (
        <span className="text-muted">Keewano demand data is unavailable, so the agent negotiates without demand numbers.</span>
      ) : (
        <span>
          <span className="tabular font-semibold">{evidence.abandonedOverPrice90d}</span> of{" "}
          <span className="tabular font-semibold">{evidence.interestedBuyers90d}</span> startups that looked at SOC 2 software walked away over price in the last 90 days.
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">Keewano</Badge>
        {evidence.source === "keewano_live" && <Badge tone="accent">Live</Badge>}
        {evidence.source === "keewano_cached" && <Badge tone="warn">Cached, {fmtAgo(evidence.ranAt, now)}</Badge>}
        {evidence.isSyntheticHistory && <Badge tone="neutral">Synthetic history</Badge>}
      </span>
    </div>
  );
}

function SettleFooter({
  view,
  best,
  running,
  live,
  onSettled,
}: {
  view: PoolView;
  best: Lane | null;
  running: boolean;
  live: boolean;
  onSettled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = view.pool.status === "settled";

  async function settle() {
    setBusy(true);
    setError(null);
    const res = await postJson("/api/pool/settle", {});
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSettled();
  }

  return (
    <section aria-label="Settle the pool" className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 text-sm">
        {settled ? (
          <p>
            <span className="font-semibold">Pool settled.</span> <span className="text-muted">Final prices and cancellations are saved. Buyers with group deals have their own test account links.</span>
          </p>
        ) : best && best.eff ? (
          <p>
            <span className="font-semibold">Best deal: {best.vendor.name} at {usdSeat(best.eff.effectiveCents)} per seat.</span>{" "}
            <span className="text-muted">
              Settlement checks price caps, expiry, and final volume. Buyers who cannot get a valid price within their cap are canceled and their hold released.
            </span>
          </p>
        ) : (
          <p className="text-muted">No eligible group quote. Settlement uses list price where the buyer&apos;s cap allows it and cancels the other orders.</p>
        )}
        {error && (
          <p role="alert" className="mt-2 max-w-xl break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {!settled && (
          <button
            type="button"
            onClick={settle}
            disabled={busy || running || view.calls.some((c) => c.status !== "extracted" && c.status !== "failed") || !live}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Spinner />}
            {best ? "Settle pool with best deal" : "Settle pool without a group deal"}
          </button>
        )}
        <Link href="/pool" className="text-sm font-medium text-accent-strong underline underline-offset-2 hover:text-accent">
          {settled ? "See final prices on the marketplace" : "Open the marketplace"}
        </Link>
      </div>
    </section>
  );
}
