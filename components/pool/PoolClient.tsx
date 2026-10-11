"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PoolView } from "@/lib/contracts";
import Link from "next/link";
import DemoControls from "./DemoControls";
import DetailsDrawer from "./DetailsDrawer";
import { Legend, OrderDock, SearchPill, StatPill } from "./Overlays";
import type { DataSource } from "./PoolHeader";
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
  const [drawer, setDrawer] = useState(false);
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

  const onChanged = () => void refreshRef.current();

  const btn =
    "inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-canvas";

  return (
    <div className="relative isolate h-[calc(100dvh-49px)] min-h-[640px] overflow-hidden bg-[#eef1f3]">
      <section aria-label="Demand map" className="absolute inset-0 z-0">
        {view ? (
          <DemandMap view={view} />
        ) : (
          <p className="grid h-full place-items-center text-sm text-muted" role="status">
            Loading the marketplace…
          </p>
        )}
      </section>

      {view && (
        <>
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 sm:inset-x-6 sm:top-5 sm:flex-row sm:items-start sm:justify-between [&>*]:pointer-events-auto">
            <SearchPill category={view.pool.category} />
            <StatPill view={view} source={source} stale={stale} />
            <Legend className="flex w-fit sm:hidden" />
          </div>

          <Legend className="absolute bottom-6 left-6 z-10 hidden sm:flex" />

          <OrderDock view={view} />

          <div className="absolute inset-x-3 bottom-6 z-10 flex gap-2 sm:inset-x-auto sm:right-6">
            <Link href="/negotiation" className={`${btn} flex-1 sm:flex-none`}>
              Live negotiation
            </Link>
            <button type="button" className={`${btn} cursor-pointer`} onClick={() => setDrawer(true)}>
              Details
            </button>
            <DemoControls view={view} onChanged={onChanged} />
          </div>

          {drawer && (
            <DetailsDrawer view={view} source={source} stale={stale} onChanged={onChanged} onClose={() => setDrawer(false)} />
          )}
        </>
      )}
    </div>
  );
}
