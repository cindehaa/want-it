"use client";

import { useEffect, useRef, useState } from "react";
import benchmark from "@/data/benchmark.json";
import type { PoolView } from "@/lib/contracts";
import { fmtDuration, usd } from "./format";
import { Badge } from "./ui";

const PER_BUYER_BASELINE = benchmark.steps.reduce((s, x) => s + x.baselineMinutesPerBuyer, 0);
const PER_BUYER_OURS = benchmark.steps.reduce((s, x) => s + x.ourMinutesPerBuyer, 0);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Animates toward `target` whenever it changes (real state change only). */
function useCountUp(target: number, durationMs = 900): { value: number; flash: number } {
  const [value, setValue] = useState(target);
  const [flash, setFlash] = useState(0);
  const from = useRef(target);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (from.current === target) return;
    setFlash((f) => f + 1);
    if (prefersReducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = origin + (target - origin) * eased;
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return { value, flash };
}

export default function TimeSavedHero({ view }: { view: PoolView }) {
  const ts = view.timeSaved;
  const hours = ts.netHumanMinutesSaved / 60;
  const { value, flash } = useCountUp(hours);
  const agentCalls = view.calls.filter((c) => c.status !== "failed").length;
  const projected = Math.round((100 * ts.netHumanMinutesSaved) / 60);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const baselineTotal = ts.baselineMinutesTotal;
  const oursPct = baselineTotal > 0 ? Math.max(2, (ts.ourMinutesTotal / baselineTotal) * 100) : 0;

  return (
    <section aria-labelledby="time-saved-h" className="relative rounded-xl border border-accent/30 bg-accent-soft px-5 pb-4 pt-5">
      <h2 id="time-saved-h" className="text-sm font-medium text-accent-strong">
        Founder time given back
      </h2>
      <p
        key={flash}
        className={`tabular mt-1 flex items-baseline gap-2 font-semibold leading-none tracking-[-0.04em] ${flash > 0 ? "wi-flash" : ""}`}
        aria-live="polite"
      >
        <span className="text-[76px] sm:text-[88px]">{value.toFixed(1)}</span>
        <span className="text-2xl tracking-tight text-muted">hours</span>
      </p>

      <div className="mt-5 space-y-2.5 text-[13px]">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">
              {ts.buyers} buyers doing it themselves
              <span className="text-faint"> ({fmtDuration(PER_BUYER_BASELINE)} each)</span>
            </span>
            <span className="tabular shrink-0 whitespace-nowrap font-medium">{fmtDuration(ts.baselineMinutesTotal)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-ink/20" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">
              {ts.buyers} buyers with want-it
              <span className="text-faint"> ({fmtDuration(PER_BUYER_OURS)} checkout each)</span>
            </span>
            <span className="tabular shrink-0 whitespace-nowrap font-medium">{fmtDuration(ts.ourMinutesTotal)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${oursPct}%` }} />
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-accent/20 pt-3 text-[13px]">
        <span className="font-medium">Vendors:</span>{" "}
        {agentCalls > 0 ? (
          <>
            {agentCalls} agent {agentCalls === 1 ? "call" : "calls"} instead of {ts.buyers} sales cycles
          </>
        ) : (
          <>no agent calls yet, against {ts.buyers} sales cycles</>
        )}
      </p>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
        <span>
          Not human time: <span className="tabular">{ts.agentCallMinutes}</span> min of agent calls
        </span>
        <span>
          Seat savings: <span className="tabular">{usd(ts.moneySavedCents)}</span>
        </span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed border-accent/40 bg-white/60 px-2.5 py-1.5 text-xs">
        <Badge tone="neutral">Projection</Badge>
        <span>
          At 100 pools a month, about <span className="tabular font-semibold">{projected.toLocaleString("en-US")} hours</span>
        </span>
      </div>

      {ts.hasEstimates && (
        <div ref={wrapRef} className="mt-3 text-xs">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-left text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            Includes estimates. See methodology
          </button>
          {open && (
            <div
              role="dialog"
              aria-label="Time-saved methodology"
              className="absolute inset-x-2 bottom-11 z-[1500] max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-white p-3 text-left shadow-lg"
            >
              <p className="mb-2 text-[13px] font-semibold text-ink">How we count human time</p>
              <ul className="space-y-2">
                {benchmark.steps.map((s) => (
                  <li key={s.id} className="text-[12px] leading-snug">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{s.label}</span>
                      <Badge tone={s.kind === "observed" ? "accent" : "warn"}>{s.kind}</Badge>
                    </div>
                    <div className="tabular text-muted">
                      {s.baselineMinutesPerBuyer} min by hand, {s.ourMinutesPerBuyer} min with want-it
                    </div>
                    {s.note && <div className="text-faint">{s.note}</div>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">
                Net = buyers x (by hand - with want-it). Agent call minutes, waiting time and money saved are never counted as human time.{" "}
                {benchmark.kindNote}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
