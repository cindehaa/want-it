"use client";

import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/contracts";
import type { PrivatePolicy } from "@/lib/dial/vendorPersonas";
import { fmtDate, fmtDateTime, fmtMmSs, usdSeat } from "@/components/pool/format";
import { Badge, Dot } from "@/components/pool/ui";
import type { Lane, LaneStatus, PoolFacts } from "./derive";

export type PersonaView = { vendorId: string; displayName: string; privatePolicy: PrivatePolicy };
export type VendorMode = "ai" | "human";

const STATUS: Record<LaneStatus, { label: string; tone: "neutral" | "accent" | "warn" | "danger" | "ink"; pulse: boolean }> = {
  waiting: { label: "Waiting", tone: "neutral", pulse: false },
  calling: { label: "Calling", tone: "warn", pulse: true },
  transcribing: { label: "Transcribing", tone: "warn", pulse: true },
  extracted: { label: "Quote extracted", tone: "accent", pulse: false },
  failed: { label: "Failed", tone: "danger", pulse: false },
  no_recording: { label: "No recording", tone: "neutral", pulse: false },
};

const RECENT_TURNS = 6;

function isAgent(speaker: string): boolean {
  return /agent|assistant|\bai\b|bot|dial|want-?it/i.test(speaker);
}

export default function VendorLane({
  lane,
  facts,
  persona,
  mode,
  active,
  runningHint,
  lineNumber,
  elapsedMs,
  playback = false,
  winner = false,
}: {
  lane: Lane;
  facts: PoolFacts;
  persona: PersonaView | undefined;
  mode: VendorMode;
  active: boolean;
  /** Shown while waiting during a run, e.g. "Next up". */
  runningHint: string | null;
  /** Phone line number shown in the lane header (1-based). */
  lineNumber: number;
  /** Call timer override (recorded playback clock). Otherwise derived from the live call. */
  elapsedMs?: number | null;
  /** Recorded-call playback: the lane shows a replay of a real finished call. */
  playback?: boolean;
  /** Highlight as the best deal. */
  winner?: boolean;
}) {
  const { vendor, call, quote, status } = lane;
  const st = STATUS[status];
  const [expanded, setExpanded] = useState(false);
  const turns = call?.transcriptTurns ?? [];
  // Live call timer: ticks once a second while this lane's call is active.
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || elapsedMs != null) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, elapsedMs]);
  const lastTurnMs = turns.reduce((m, t) => Math.max(m, t.startMs), 0);
  const elapsed =
    elapsedMs != null
      ? elapsedMs
      : !call
        ? null
        : active
          ? Math.max(0, tickNow - new Date(call.startedAt).getTime())
          : call.source === "live" && call.endedAt
            ? Math.max(0, new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime())
            : lastTurnMs || null;
  const shown = expanded ? turns : turns.slice(-RECENT_TURNS);
  const offset = turns.length - shown.length;

  // Animate only what arrives after this lane first rendered this call.
  const seen = useRef<{ callId: string | null; turns: number; quote: boolean }>({ callId: call?.id ?? null, turns: turns.length, quote: !!quote });
  if (seen.current.callId !== (call?.id ?? null)) seen.current = { callId: call?.id ?? null, turns: 0, quote: false };
  const quoteIsNew = !!quote && !seen.current.quote;

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, expanded]);

  const vendorMode: VendorMode = mode;
  const failedNote =
    status === "failed"
      ? call
        ? `Call failed${call.error ? `: ${call.error}` : "."} No quote from this call.`
        : "No call was placed to this vendor."
      : status === "no_recording"
        ? "No recorded call exists for this vendor, so there is nothing to replay."
        : null;

  return (
    <article
      aria-label={`${vendor.name} negotiation`}
      className={`flex min-w-0 flex-col rounded-xl border bg-surface transition-colors ${
        winner ? "border-accent ring-2 ring-accent/40" : active ? "border-warn/50" : status === "extracted" ? "border-accent/30" : "border-line"
      }`}
    >
      <header className="px-3.5 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${active ? "animate-pulse bg-danger" : "bg-line"}`} />
            Line {lineNumber}
            <span className={active ? "text-danger" : "text-faint"}>{active ? (playback ? "On call · replay" : "On call") : call ? "Call ended" : "Idle"}</span>
          </span>
          <span className="tabular text-xs font-medium text-ink" aria-label="Call timer">
            {elapsed != null ? fmtMmSs(elapsed) : "0:00"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold leading-tight tracking-tight">{vendor.name}</h3>
            <p className="tabular mt-0.5 text-xs text-muted">List {usdSeat(vendor.listPricePerSeatCents)} per seat</p>
          </div>
          <span className={`shrink-0 rounded-full ${active ? "neg-calling" : ""}`}>
            <Badge tone={st.tone}>
              {st.pulse && <Dot className="animate-pulse bg-current" />}
              {st.label}
            </Badge>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="neutral">{vendorMode === "ai" ? "Simulated vendor · AI agent" : "Test vendor · human"}</Badge>
          {call &&
            (call.source === "live" ? (
              <Badge tone="ink">Live call</Badge>
            ) : (
              <Badge tone="warn">Recorded · {call.recordedAt ? fmtDateTime(call.recordedAt) : "time unknown"}</Badge>
            ))}
        </div>
        <p className="tabular mt-2 h-[18px] truncate text-[12px] leading-[18px] text-muted">
          {call &&
            !playback &&
            (lane.bestBefore != null ? (
              <>
                Best offer in hand: <span className="font-medium text-ink">{usdSeat(lane.bestBefore)}</span>
              </>
            ) : (
              "No earlier offer to cite yet."
            ))}
        </p>
      </header>

      <div className="border-t border-line px-3.5 py-3">
        <div
          ref={scroller}
          tabIndex={0}
          aria-label={`${vendor.name} call transcript`}
          aria-live="polite"
          className={`space-y-2 overflow-y-auto pr-2 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] ${call ? "h-[280px]" : "min-h-[72px]"}`}
        >
          {turns.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-muted">
              {failedNote ??
                (status === "calling"
                  ? "Dialing. Turns appear here as the call is transcribed."
                  : status === "transcribing"
                    ? "Call ended. Waiting for the transcript."
                    : runningHint ?? (playback ? "Line open. Turns appear as the recorded call plays." : "Not called yet."))}
            </p>
          ) : (
            shown.map((t, i) => {
              const idx = offset + i;
              const agent = isAgent(t.speaker);
              const isNew = idx >= seen.current.turns;
              return (
                <div key={`${call?.id}-${idx}`} className={`flex flex-col ${agent ? "items-end" : "items-start"} ${isNew ? "neg-turn-new" : ""}`}>
                  <span className="mb-0.5 text-[10.5px] text-faint">
                    {agent ? "Agent" : vendor.name} <span className="tabular">{fmtMmSs(t.startMs)}</span>
                  </span>
                  <p
                    className={`max-w-[92%] break-words rounded-2xl px-2.5 py-1.5 text-[12.5px] leading-snug ${
                      agent ? "rounded-br-md bg-accent-soft" : "rounded-bl-md bg-canvas"
                    }`}
                  >
                    {t.text}
                  </p>
                </div>
              );
            })
          )}
          {turns.length > 0 && failedNote && <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{failedNote}</p>}
        </div>
        {turns.length > RECENT_TURNS && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-2 text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {expanded ? `Show last ${RECENT_TURNS} turns` : `Show all ${turns.length} turns`}
          </button>
        )}
      </div>

      <div className="flex-1 border-t border-line px-3.5 py-3">
        {quote ? (
          <QuoteBlock key={quote.id} quote={quote} lane={lane} facts={facts} animate={quoteIsNew} />
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {status === "extracted" ? "Call ended without a usable quote." : "The supplier-stated quote appears here once the call is transcribed."}
          </p>
        )}
      </div>

      {persona && <PolicyDisclosure persona={persona} mode={vendorMode} />}
    </article>
  );
}

function QuoteBlock({ quote, lane, facts, animate }: { quote: Quote; lane: Lane; facts: PoolFacts; animate: boolean }) {
  const tiers = [...quote.tiers].sort((a, b) => a.minSeats - b.minSeats);
  const eff = lane.eff;
  return (
    <div className={`rounded-lg border border-accent/30 bg-accent-soft/50 p-2.5 ${animate ? "neg-quote-new" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[13px] font-semibold">Extracted quote</span>
        <Badge tone="accent">supplier-stated</Badge>
      </div>

      <ul className="tabular mt-2 space-y-0.5 text-[12.5px]">
        {tiers.map((t) => {
          const applied = eff?.appliedMinSeats === t.minSeats;
          return (
            <li key={t.minSeats} className={`flex items-baseline justify-between gap-2 ${applied ? "font-semibold text-accent-strong" : ""}`}>
              <span className={applied ? "" : "text-muted"}>
                {t.minSeats}+ seats{applied ? ` (pool: ${facts.seats})` : ""}
              </span>
              <span>{usdSeat(t.pricePerSeatCents)}</span>
            </li>
          );
        })}
      </ul>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-accent/15 pt-2 text-[12px]">
        <dt className="text-muted">Per-account fee</dt>
        <dd className="tabular text-right">{quote.perAccountFeeCents > 0 ? usdSeat(quote.perAccountFeeCents) : "None stated"}</dd>
        <dt className="text-muted">Separate accounts</dt>
        <dd className="text-right">{quote.separateAccountsConfirmed === true ? "Confirmed" : quote.separateAccountsConfirmed === false ? "Not offered" : "Not confirmed"}</dd>
        <dt className="text-muted">Valid until</dt>
        <dd className="text-right">{quote.expiresAt ? fmtDate(quote.expiresAt) : "Not stated"}</dd>
        {eff && (
          <>
            <dt className="font-medium text-ink">Effective</dt>
            <dd className="tabular text-right font-semibold text-ink">{usdSeat(eff.effectiveCents)} per seat</dd>
          </>
        )}
      </dl>
      {!lane.eligible && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-warn">
          {quote.separateAccountsConfirmed === true ? "No tier applies at this pool size." : "Not ranked: separate accounts not confirmed."}
        </p>
      )}

      {quote.conditions.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] leading-snug">
          {quote.conditions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      {quote.evidence && (
        <blockquote className="mt-2 break-words border-l-2 border-accent/50 pl-2.5 text-[12px] italic leading-snug text-muted">
          &ldquo;{quote.evidence}&rdquo;
        </blockquote>
      )}
    </div>
  );
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

function PolicyDisclosure({ persona, mode }: { persona: PersonaView; mode: VendorMode }) {
  const [open, setOpen] = useState(false);
  const p = persona.privatePolicy;
  const panelId = `policy-${persona.vendorId}`;
  return (
    <div className="rounded-b-xl border-t border-line bg-canvas/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-1.5 px-3.5 py-2 text-left text-xs text-muted hover:text-ink"
      >
        <span aria-hidden className="mt-px inline-block w-2.5 shrink-0 text-faint">
          {open ? "▾" : "▸"}
        </span>
        <span>
          Vendor&rsquo;s private pricing policy, hidden from our agent
          {mode === "ai" ? "" : " (human-played)"}
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-3.5 py-2.5">
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
