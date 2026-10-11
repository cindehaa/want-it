"use client";

// Per-vendor helpers that survived the call wall: speaker detection and the vendor's private pricing policy
// (shown only inside the Details disclosure, never on the wall itself).
import { useState } from "react";
import type { PrivatePolicy } from "@/lib/dial/vendorPersonas";
import { usdSeat } from "@/components/pool/format";

export type PersonaView = { vendorId: string; displayName: string; privatePolicy: PrivatePolicy };
export type VendorMode = "ai" | "human";

export function isAgent(speaker: string): boolean {
  return /agent|assistant|\bai\b|bot|dial|want-?it/i.test(speaker);
}

function TierList({ tiers }: { tiers: PrivatePolicy["openingTiers"] }) {
  return (
    <ul className="tabular space-y-0.5">
      {[...tiers]
        .sort((a, b) => a.minSeats - b.minSeats)
        .map((t) => (
          <li key={t.minSeats}>
            {usdSeat(t.pricePerSeatCents)} <span className="text-muted">at {t.minSeats}+</span>
          </li>
        ))}
    </ul>
  );
}

export function PolicyDisclosure({ persona, mode, vendorName }: { persona: PersonaView; mode: VendorMode; vendorName: string }) {
  const [open, setOpen] = useState(false);
  const p = persona.privatePolicy;
  const panelId = `policy-${persona.vendorId}`;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left text-[13px] hover:bg-canvas"
      >
        <span className="font-medium text-ink">{vendorName}</span>
        <span className="text-xs text-muted">
          {open ? "Hide" : "Show"} private policy{mode === "ai" ? "" : ", human-played"}
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-3.5 py-2.5">
          <p className="mb-2 text-[11.5px] text-muted">Hidden from our agent during the call.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="text-muted">List price</dt>
            <dd className="tabular text-right">{usdSeat(p.listPricePerSeatCents)}</dd>
            <dt className="text-muted">Opens at</dt>
            <dd className="text-right">
              <TierList tiers={p.openingTiers} />
            </dd>
            <dt className="text-muted">Floor</dt>
            <dd className="text-right">
              <TierList tiers={p.floorTiers} />
            </dd>
            <dt className="text-muted">Account fee</dt>
            <dd className="tabular text-right">{p.perAccountFeeCents > 0 ? usdSeat(p.perAccountFeeCents) : "None"}</dd>
          </dl>
          {p.concessions.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 border-t border-line pt-2 pl-4 text-[12px] leading-snug">
              {p.concessions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
