"use client";

import { Badge, Spinner } from "@/components/pool/ui";

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
}: {
  running: boolean;
  pending: RunMode | null;
  error: string | null;
  parallelAvailable: boolean;
  canPlayback: boolean;
  playbackOpen: boolean;
  onRun: (mode: RunMode) => void;
  onPlayback: () => void;
}) {
  const busy = running || pending !== null;
  const btn =
    "inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 lg:items-end" aria-label="Operator controls">
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Operator controls</span>
        <button type="button" onClick={onPlayback} disabled={!canPlayback || busy} className={btn} title={canPlayback ? undefined : "No finished calls with transcripts to play yet."}>
          {playbackOpen ? "Replay again" : "Play recorded calls side by side"}
        </button>
        <button type="button" onClick={() => onRun("replay")} disabled={busy} className={btn}>
          {pending === "replay" && <Spinner />}
          Replay (re-run recordings)
        </button>
        <button type="button" onClick={() => onRun("live")} disabled={busy} className={btn}>
          {pending === "live" && <Spinner />}
          Run live, one at a time
        </button>
        {parallelAvailable && (
          <button type="button" onClick={() => onRun("parallel")} disabled={busy} className={btn}>
            {pending === "parallel" && <Spinner />}
            Run live, all vendors in parallel
          </button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-faint lg:text-right">
        Live calls are real Dial phone calls (~3 min each).
        {running && <Badge tone="warn"> running</Badge>}
      </p>
      {error && (
        <p role="alert" className="max-w-md break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
