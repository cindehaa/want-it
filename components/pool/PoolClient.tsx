"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PoolView } from "@/lib/contracts";
import EvidenceCard from "./EvidenceCard";
import NegotiationPanel from "./NegotiationPanel";
import PoolHeader, { type DataSource } from "./PoolHeader";
import PriceCurve from "./PriceCurve";
import TimeSavedHero from "./TimeSavedHero";
import { buildFixture, type FixtureStage } from "./fixture";

const DemandMap = dynamic(() => import("./DemandMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading map…</div>,
});

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
      <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <p className="text-sm text-muted" role="status">
          Loading the marketplace…
        </p>
      </main>
    );
  }

  const onChanged = () => void refreshRef.current();

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-5 sm:px-6">
      <PoolHeader view={view} source={source} stale={stale} onChanged={onChanged} />

      <div className="mt-5 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] lg:items-start lg:gap-5">
        {/* Left: the mechanism. On small screens the wrappers dissolve so `order` can interleave. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <section
            aria-label="Demand map"
            className="relative isolate order-2 h-[340px] overflow-hidden rounded-xl border border-line bg-surface sm:h-[440px] lg:order-none lg:h-[500px]"
          >
            <DemandMap view={view} />
          </section>
          <section aria-label="Price and demand curve" className="order-3 min-w-0 rounded-xl border border-line bg-surface lg:order-none">
            <PriceCurve view={view} />
          </section>
        </div>

        {/* Right: hero + evidence + negotiation. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-1 min-w-0 lg:order-none">
            <TimeSavedHero view={view} />
          </div>
          <div className="order-4 min-w-0 divide-y divide-line rounded-xl border border-line bg-surface lg:order-none">
            <EvidenceCard evidence={view.evidence} now={view.now} />
            <NegotiationPanel view={view} onChanged={onChanged} />
          </div>
        </div>
      </div>
    </main>
  );
}
