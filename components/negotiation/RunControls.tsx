"use client";

import { Badge, Spinner } from "@/components/pool/ui";

export type RunMode = "live" | "replay";

export default function RunControls({
  running,
  pending,
  error,
  onRun,
}: {
  running: boolean;
  pending: RunMode | null;
  error: string | null;
  onRun: (mode: RunMode) => void;
}) {
  const busy = running || pending !== null;
  return (
    <div className="flex min-w-0 flex-col gap-2 lg:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onRun("live")}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "live" && <Spinner />}
          Run negotiation with all vendors
        </button>
        <button
          type="button"
          onClick={() => onRun("replay")}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "replay" && <Spinner />}
          Replay recorded calls
        </button>
      </div>
      <p className="text-xs leading-snug text-muted lg:text-right">
        Calls are real Dial phone calls, one at a time (~3 min each).
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
