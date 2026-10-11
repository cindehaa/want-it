"use client";

import { useState } from "react";
import { Spinner } from "@/components/pool/ui";

export type RunMode = "live" | "replay" | "parallel";

// Buyers never trigger negotiation (the marketplace dispatches the agents automatically). These are low-emphasis
// operator tools for demos: replay the recordings side by side, or place real Dial calls.
export default function RunControls({
  running,
  pending,
  error,
  parallelAvailable,
  canPlayback,
  playbackOpen,
  onRun,
  onPlayback,
  onStop,
  stopping,
  settled,
}: {
  running: boolean;
  pending: RunMode | null;
  error: string | null;
  parallelAvailable: boolean;
  canPlayback: boolean;
  playbackOpen: boolean;
  onRun: (mode: RunMode) => void;
  onPlayback: () => void;
  onStop: () => void;
  stopping: boolean;
  settled: boolean;
}) {
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const liveCall = async () => {
    setLiveBusy(true);
    setLiveErr(null);
    try {
      const r = await fetch("/api/demo/live-call", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setLiveErr(j.error ?? `HTTP ${r.status}`);
    } finally {
      setLiveBusy(false);
    }
  };
  const busy = running || pending !== null || liveBusy;
  const startDisabled = busy || settled;
  const btn =
    "inline-flex h-6 items-center gap-1 rounded border border-line bg-surface px-2 text-[11px] font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex min-w-0 flex-col items-end gap-1" aria-label="Operator controls">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <span className="text-[11px] text-faint">Operator:</span>
        <button type="button" onClick={onPlayback} disabled={!canPlayback || busy} className={btn} title={canPlayback ? undefined : "No finished calls with transcripts to play yet."}>
          {playbackOpen ? "Replay again" : "Play recorded calls side by side"}
        </button>
        <button type="button" onClick={() => void liveCall()} disabled={busy} className={`${btn} border-ink`}>
          {liveBusy && <Spinner />}
          Real call: Vantly (human)
        </button>
        <button type="button" onClick={() => onRun("replay")} disabled={startDisabled} className={btn}>
          {pending === "replay" && <Spinner />}
          Replay (re-run recordings)
        </button>
        <button type="button" onClick={() => onRun("live")} disabled={startDisabled} className={btn}>
          {pending === "live" && <Spinner />}
          Run live, one at a time
        </button>
        {parallelAvailable && (
          <button type="button" onClick={() => onRun("parallel")} disabled={startDisabled} className={btn}>
            {pending === "parallel" && <Spinner />}
            Run live, all vendors in parallel
          </button>
        )}
        {running && <button type="button" onClick={onStop} disabled={stopping} className={btn}>{stopping ? "Stopping..." : "Stop after current calls"}</button>}
      </div>
      <p className="text-[11px] leading-snug text-faint">Live calls are real Dial phone calls, about 3 min each.{running ? " Running." : ""}</p>
      {liveErr && (
        <p role="alert" className="max-w-md break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {liveErr}
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-md break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
