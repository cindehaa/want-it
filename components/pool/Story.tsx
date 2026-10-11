"use client";

import type { ReactNode } from "react";
import type { PoolView } from "@/lib/contracts";

/**
 * Where the story is right now:
 *  negotiate: no quote yet (or a call is in flight) -> step 3 is next
 *  settle:    quotes exist, pool not settled        -> step 4 is next
 *  done:      pool settled
 */
export type Phase = "negotiate" | "settle" | "done";

export function phaseOf(view: PoolView): Phase {
  if (view.pool.status === "settled") return "done";
  const busy = view.calls.some((c) => c.status === "queued" || c.status === "in_progress");
  if (view.quotes.length > 0 && !busy) return "settle";
  return "negotiate";
}

type StepState = "done" | "current" | "upcoming";

/** Steps 1 and 2 are context the page already has; the phase decides 3 and 4. */
export function stepState(n: 1 | 2 | 3 | 4, phase: Phase): StepState {
  const current = phase === "negotiate" ? 3 : phase === "settle" ? 4 : 5;
  if (n < current) return "done";
  if (n === current) return "current";
  return "upcoming";
}

const STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Pool demand",
  2: "Find leverage",
  3: "Negotiate",
  4: "Settle",
};

function Check({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-3 w-3 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}

function Marker({ n, state }: { n: number; state: StepState }) {
  const tone =
    state === "current"
      ? "bg-accent text-white border-accent"
      : state === "done"
        ? "bg-accent-soft text-accent-strong border-accent/30"
        : "bg-white text-faint border-line";
  return (
    <span
      aria-hidden
      className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold leading-none ${tone}`}
    >
      {state === "done" ? <Check /> : n}
    </span>
  );
}

/** Slim, sticky progress strip: 1 to 4, current step highlighted. */
export function Stepper({ phase }: { phase: Phase }) {
  const steps = [1, 2, 3, 4] as const;
  return (
    <nav
      aria-label="Progress"
      className="sticky top-12 z-[1000] -mx-4 mt-7 border-b border-line bg-white/90 px-4 backdrop-blur sm:-mx-6 sm:px-6"
    >
      <ol className="flex items-center gap-1 py-2.5 sm:gap-2">
        {steps.map((n, i) => {
          const state = stepState(n, phase);
          return (
            <li key={n} className="flex items-center gap-1 sm:gap-2" aria-current={state === "current" ? "step" : undefined}>
              <a
                href={`#step-${n}`}
                className={`flex items-center gap-2 rounded-md py-1 text-[13px] transition-colors ${
                  state === "current" ? "font-semibold text-ink" : state === "done" ? "text-muted hover:text-ink" : "text-faint hover:text-muted"
                }`}
              >
                <Marker n={n} state={state} />
                <span className={state === "current" ? "" : "hidden sm:inline"}>{STEP_LABELS[n]}</span>
              </a>
              {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-4 bg-line sm:w-10" />}
            </li>
          );
        })}
        <li className="ml-auto hidden text-[12px] text-muted sm:block" aria-live="polite">
          {phase === "negotiate" && "Next: call a vendor"}
          {phase === "settle" && "Next: settle the pool"}
          {phase === "done" && "Pool settled"}
        </li>
      </ol>
    </nav>
  );
}

/** One numbered step: marker + title, optional right-side badges, content indented under a hairline rail. */
export function Step({
  n,
  title,
  state,
  aside,
  last,
  children,
}: {
  n: 1 | 2 | 3 | 4;
  title: string;
  state: StepState;
  aside?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={`step-${n}`} aria-labelledby={`step-${n}-h`} className="relative scroll-mt-28 pb-12 sm:pb-14">
      {!last && <span aria-hidden className="absolute bottom-3 left-3 top-9 hidden w-px bg-line sm:block" />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Marker n={n} state={state} />
        <h2
          id={`step-${n}-h`}
          className={`text-[20px] font-semibold leading-tight tracking-[-0.02em] ${state === "upcoming" ? "text-muted" : "text-ink"}`}
        >
          {title}
        </h2>
        {aside && <div className="flex flex-wrap items-center gap-1.5">{aside}</div>}
      </div>
      <div className="mt-4 min-w-0 sm:pl-9">{children}</div>
    </section>
  );
}
