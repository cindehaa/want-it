"use client";

import { useEffect, useRef, useState } from "react";
import type { PoolView } from "@/lib/contracts";
import { postJson } from "./api";
import { Spinner } from "./ui";

/** Kebab button + popover with the demo clock controls (+24h, Close window now, Reset demo). */
export default function DemoControls({ view, onChanged }: { view: PoolView; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<null | "plus" | "close" | "reset">(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const closesInMs = new Date(view.pool.windowClosesAt).getTime() - new Date(view.now).getTime();

  async function run(kind: "plus" | "close" | "reset", path: string, body: unknown) {
    setPending(kind);
    setError(null);
    const res = await postJson(path, body);
    setPending(null);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  const item =
    "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Demo controls"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-muted transition-colors hover:bg-canvas"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="#5f6a75">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Demo controls"
          className="absolute bottom-full right-0 z-20 mb-2 w-[248px] rounded-xl border border-line bg-white p-2 shadow-[0_10px_30px_rgba(18,23,28,.10)]"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium text-muted">
            Demo clock{" "}
            <span className="tabular text-ink">
              {view.clockOffsetHours > 0 ? `+${Math.round(view.clockOffsetHours * 10) / 10}h` : "real time"}
            </span>
          </p>
          {view.demoMode ? (
            <>
              <button type="button" className={item} disabled={pending !== null} onClick={() => run("plus", "/api/demo/clock", { advanceHours: 24 })}>
                {pending === "plus" && <Spinner />}+24h
              </button>
              <button
                type="button"
                className={item}
                disabled={pending !== null}
                onClick={() => {
                  if (closesInMs <= 0) {
                    setError("The window is already closed.");
                    return;
                  }
                  // round up so the window is certainly closed afterwards
                  const advanceHours = Math.ceil((closesInMs / 3600_000) * 60) / 60;
                  void run("close", "/api/demo/clock", { advanceHours });
                }}
              >
                {pending === "close" && <Spinner />}
                Close window now
              </button>
              <button type="button" className={item} disabled={pending !== null} onClick={() => run("reset", "/api/demo/reset", {})}>
                {pending === "reset" && <Spinner />}
                Reset demo
              </button>
            </>
          ) : (
            <p className="px-2.5 pb-2 text-[13px] text-muted">Demo mode is off, so the clock and reset are unavailable.</p>
          )}
          {error && (
            <p role="alert" className="break-words px-2.5 pb-1.5 pt-1 text-[11px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
