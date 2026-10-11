"use client";

import { useEffect, useRef } from "react";
import type { PoolView } from "@/lib/contracts";
import EvidenceCard, { EvidenceBadges } from "./EvidenceCard";
import NegotiationPanel from "./NegotiationPanel";
import PoolHeader, { type DataSource } from "./PoolHeader";
import PriceCurve from "./PriceCurve";
import SettlePanel from "./SettlePanel";
import { Step, phaseOf, stepState } from "./Story";
import TimeSavedHero from "./TimeSavedHero";

const EXCLUSION_REASON: Record<string, string> = {
  wrong_category: "different category",
  deadline_before_window: "deadline before the window closes",
  canceled: "canceled",
};

/** Right-side drawer with everything analytical: evidence, calls, price curve, settle, time saved. */
export default function DetailsDrawer({
  view,
  source,
  stale,
  onChanged,
  onClose,
}: {
  view: PoolView;
  source: DataSource;
  stale: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const phase = phaseOf(view);
  const ordersById = new Map(view.orders.map((o) => [o.id, o]));
  const excluded = view.pool.exclusions.flatMap((e) => {
    const o = ordersById.get(e.orderId);
    return o ? [{ name: o.buyerName, reason: EXCLUSION_REASON[e.reason] ?? e.reason }] : [];
  });

  return (
    <>
      <div aria-hidden className="absolute inset-0 z-20 bg-[#12171c]/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Details"
        className="mf-drawer absolute bottom-0 right-0 top-0 z-30 flex w-full max-w-[640px] flex-col border-l border-line bg-white shadow-[-10px_0_30px_rgba(18,23,28,.10)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 sm:px-6">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">Details</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5 sm:px-6">
          <PoolHeader view={view} source={source} stale={stale} />

          <div className="mt-8">
            <Step n={1} title="Pool the demand" state={stepState(1, phase)}>
              <p className="text-[15px] leading-snug">
                <span className="tabular font-semibold">{view.pool.memberOrderIds.length}</span> startups
                {" · "}
                <span className="tabular font-semibold">{view.pool.totalSeats}</span> seats waiting.{" "}
                <span className="text-muted">Cards are held, not charged.</span>
              </p>
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

            <Step n={2} title="Find leverage" state={stepState(2, phase)} aside={<EvidenceBadges evidence={view.evidence} now={view.now} />}>
              <EvidenceCard evidence={view.evidence} />
            </Step>

            <Step n={3} title="Negotiate by phone" state={stepState(3, phase)}>
              <NegotiationPanel view={view} phase={phase} onChanged={onChanged} />
            </Step>

            <Step n={4} title="Everyone pays less" state={stepState(4, phase)} last>
              <PriceCurve view={view} />
              <SettlePanel view={view} phase={phase} onChanged={onChanged} />
            </Step>
          </div>

          <div className="mt-2">
            <TimeSavedHero view={view} />
          </div>
        </div>
      </aside>
    </>
  );
}
