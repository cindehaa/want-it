"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PoolView } from "@/lib/contracts";
import EvidenceCard, { EvidenceBadges } from "./EvidenceCard";
import NegotiationPanel from "./NegotiationPanel";
import PoolHeader, { type DataSource } from "./PoolHeader";
import PriceCurve from "./PriceCurve";
import SettlePanel from "./SettlePanel";
import { Step, Stepper, phaseOf, stepState } from "./Story";
import TimeSavedHero from "./TimeSavedHero";
import { buildFixture, type FixtureStage } from "./fixture";

const DemandMap = dynamic(() => import("./DemandMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading map…</div>,
});

const EXCLUSION_REASON: Record<string, string> = {
  wrong_category: "different category",
  deadline_before_window: "deadline before the window closes",
  canceled: "canceled",
};

const POLL_MS = 1500;
const CALL_POLL_MS = 3000;
const TERMINAL = new Set(["extracted", "failed"]);

function looksLikePoolView(v: unknown): v is PoolView {
  const o = v as Partial<PoolView> | null;
  return !!o && typeof o === "object" && !!o.pool && Array.isArray(o.orders) && Array.isArray(o.calls) && Array.isArray(o.quotes) && !!o.timeSaved && !!o.evidence;
}

export default function PoolClient() {
  const [view, setView] = useState<PoolView | null>(null);
  const [source, setSource] = useState<DataSource>("live");
  const [stale, setStale] = useState(false);
  const everLive = useRef(false);
  const forced = useRef<FixtureStage | null>(null);
  const callPolledAt = useRef(new Map<string, number>());
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
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

      // No webhooks: nudge in-flight calls so Dial polling + quote extraction advance.
      const nowMs = Date.now();
      for (const c of json.calls) {
        if (TERMINAL.has(c.status)) continue;
        const last = callPolledAt.current.get(c.id) ?? 0;
        if (nowMs - last < CALL_POLL_MS) continue;
        callPolledAt.current.set(c.id, nowMs);
        fetch(`/api/calls/${encodeURIComponent(c.id)}`, { cache: "no-store" }).catch(() => {});
      }
    } catch {
      if (everLive.current) {
        setStale(true);
      } else {
        setView((prev) => prev ?? buildFixture("open"));
        setSource("fixture");
      }
    }
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    const stage = new URLSearchParams(window.location.search).get("fixture");
    if (stage === "open" || stage === "quoted" || stage === "settled") {
      forced.current = stage;
      setView(buildFixture(stage));
      setSource("fixture");
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refreshRef.current();
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!view) {
    return (
      <main className="mx-auto max-w-[920px] px-4 py-10 sm:px-6">
        <p className="text-sm text-muted" role="status">
          Loading the marketplace…
        </p>
      </main>
    );
  }

  const onChanged = () => void refreshRef.current();
  const phase = phaseOf(view);
  const ordersById = new Map(view.orders.map((o) => [o.id, o]));
  const excluded = view.pool.exclusions.flatMap((e) => {
    const o = ordersById.get(e.orderId);
    return o ? [{ name: o.buyerName, reason: EXCLUSION_REASON[e.reason] ?? e.reason }] : [];
  });

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-white">
      <main className="mx-auto w-full max-w-[920px] px-4 pb-16 pt-5 sm:px-6">
        <PoolHeader view={view} source={source} stale={stale} onChanged={onChanged} />

        <Stepper phase={phase} />

        <div className="mt-9">
          <Step n={1} title="Pool the demand" state={stepState(1, phase)}>
            <p className="text-[15px] leading-snug">
              <span className="tabular font-semibold">{view.pool.memberOrderIds.length}</span> startups
              {" · "}
              <span className="tabular font-semibold">{view.pool.totalSeats}</span> seats in this buying window.{" "}
              <span className="text-muted">Payment holds are simulated.</span>
            </p>
            <section
              aria-label="Demand map"
              className="relative isolate mt-3 h-[280px] overflow-hidden rounded-lg border border-line bg-surface sm:h-[320px]"
            >
              <DemandMap view={view} />
            </section>
            {excluded.length > 0 && (
              <p className="mt-3 text-[13px] leading-snug text-muted">
                <span className="font-medium text-ink">Not pooled:</span>{" "}
                {excluded.map((e, i) => (
                  <span key={`${e.name}-${i}`}>
                    {i > 0 && ", "}
                    {e.name} <span className="text-faint">({e.reason})</span>
                  </span>
                ))}
              </p>
            )}
          </Step>

          <Step
            n={2}
            title="Find leverage"
            state={stepState(2, phase)}
            aside={<EvidenceBadges evidence={view.evidence} now={view.now} />}
          >
            <EvidenceCard evidence={view.evidence} />
          </Step>

          <Step n={3} title="Negotiate by phone" state={stepState(3, phase)}>
            <NegotiationPanel view={view} phase={phase} onChanged={onChanged} />
          </Step>

          <Step n={4} title="Settle each order" state={stepState(4, phase)} last>
            <PriceCurve view={view} />
            <SettlePanel view={view} phase={phase} onChanged={onChanged} />
          </Step>
        </div>

        <div className="mt-2">
          <TimeSavedHero view={view} />
        </div>
      </main>
    </div>
  );
}
