"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, PoolView, Quote } from "@/lib/contracts";
import { postJson } from "./api";
import { fmtDate, fmtDateTime, fmtMmSs, usdSeat } from "./format";
import { Badge, Dot, Spinner } from "./ui";

const STATUS: Record<Call["status"], { label: string; tone: "neutral" | "accent" | "warn" | "danger" | "ink"; live: boolean }> = {
  queued: { label: "Queued", tone: "neutral", live: true },
  in_progress: { label: "In progress", tone: "warn", live: true },
  ended: { label: "Ended", tone: "neutral", live: true },
  transcribed: { label: "Transcribed", tone: "neutral", live: true },
  extracted: { label: "Extracted", tone: "accent", live: false },
  failed: { label: "Failed", tone: "danger", live: false },
};

function isAgent(speaker: string): boolean {
  return /agent|assistant|\bai\b|bot|dial/i.test(speaker);
}

type Pending = null | "next" | "replay" | "settle";

export default function NegotiationPanel({ view, onChanged }: { view: PoolView; onChanged: () => void }) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const calls = [...view.calls].sort((a, b) => a.sequence - b.sequence);
  const latestId = calls[calls.length - 1]?.id;
  const busyCall = calls.some((c) => c.status === "queued" || c.status === "in_progress");
  const settled = view.pool.status === "settled";
  const vendorName = (id: string) => view.vendors.find((v) => v.id === id)?.name ?? id;

  async function run(kind: Exclude<Pending, null>, path: string, body: unknown) {
    setPending(kind);
    setError(null);
    const res = await postJson(path, body);
    setPending(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged();
  }

  return (
    <section aria-labelledby="neg-h" className="px-4 py-4 sm:px-5">
      <h2 id="neg-h" className="text-sm font-semibold">
        Negotiation
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("next", "/api/pool/negotiate", {})}
          disabled={pending !== null || busyCall || settled}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "next" && <Spinner />}
          Call next vendor
        </button>
        <button
          type="button"
          onClick={() => run("replay", "/api/pool/negotiate", { mode: "replay" })}
          disabled={pending !== null || busyCall || settled}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "replay" && <Spinner />}
          Use recorded call
        </button>
        <button
          type="button"
          onClick={() => run("settle", "/api/pool/settle", {})}
          disabled={pending !== null || busyCall || settled}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "settle" && <Spinner />}
          Settle pool
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      {calls.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          No calls yet. The agent calls Certly first, then calls Vantly with Certly&rsquo;s quote in hand. Both are test vendors.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {calls.map((c) => (
            <CallBlock
              key={c.id}
              call={c}
              vendorName={vendorName(c.vendorId)}
              quote={view.quotes.find((q) => q.callId === c.id)}
              expanded={open[c.id] ?? c.id === latestId}
              onToggle={() => setOpen((o) => ({ ...o, [c.id]: !(o[c.id] ?? c.id === latestId) }))}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function CallBlock({
  call,
  vendorName,
  quote,
  expanded,
  onToggle,
}: {
  call: Call;
  vendorName: string;
  quote: Quote | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const st = STATUS[call.status];
  const scroller = useRef<HTMLDivElement>(null);
  const turns = call.transcriptTurns.length;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [turns, expanded]);

  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-canvas/60 px-3 py-2">
        <span className="text-[13px] font-semibold">
          Call {call.sequence}: {vendorName}
        </span>
        <Badge tone="neutral">test vendor</Badge>
        <span className="ml-auto inline-flex items-center gap-1.5">
          {call.source === "live" ? (
            <Badge tone="ink">Live call</Badge>
          ) : (
            <Badge tone="warn">Recorded call · {call.recordedAt ? fmtDateTime(call.recordedAt) : "time unknown"}</Badge>
          )}
          <Badge tone={st.tone}>
            {st.live && call.status !== "ended" && call.status !== "transcribed" ? <Dot className="animate-pulse bg-current" /> : null}
            {st.label}
          </Badge>
        </span>
      </div>

      <div className="px-3 py-2.5">
        {call.status === "failed" && (
          <p role="alert" className="mb-2 break-words rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
            Call failed{call.error ? `: ${call.error}` : "."} No quote from this call.
          </p>
        )}

        {turns > 0 ? (
          <>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              {expanded ? "Hide transcript" : `Show transcript (${turns} turns)`}
            </button>
            {expanded && (
              <div ref={scroller} className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1" tabIndex={0} aria-label="Call transcript">
                {call.transcriptTurns.map((t, i) => {
                  const agent = isAgent(t.speaker);
                  return (
                    <div key={i} className={`flex flex-col ${agent ? "items-end" : "items-start"}`}>
                      <span className="mb-0.5 text-[10.5px] text-faint">
                        {agent ? "Agent" : vendorName} <span className="tabular">{fmtMmSs(t.startMs)}</span>
                      </span>
                      <p
                        className={`max-w-[88%] break-words rounded-2xl px-3 py-1.5 text-[12.5px] leading-snug ${
                          agent ? "rounded-br-md bg-accent-soft text-ink" : "rounded-bl-md bg-canvas text-ink"
                        }`}
                      >
                        {t.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          call.status !== "failed" && <p className="text-xs text-muted">Transcript appears here as the call is transcribed.</p>
        )}

        {quote && <QuoteCard quote={quote} vendorName={vendorName} />}
      </div>
    </li>
  );
}

function QuoteCard({ quote, vendorName }: { quote: Quote; vendorName: string }) {
  const tiers = [...quote.tiers].sort((a, b) => a.minSeats - b.minSeats);
  return (
    <div className="mt-3 rounded-md border border-accent/30 bg-accent-soft/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{vendorName} quote</span>
        <Badge tone="accent">supplier-stated</Badge>
      </div>

      <table className="mt-2 w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-2 font-medium">Pool size</th>
            <th className="py-1 text-right font-medium">Price per seat</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.minSeats} className="border-t border-accent/15">
              <td className="tabular py-1 pr-2">{t.minSeats}+ seats</td>
              <td className="tabular py-1 text-right font-medium">{usdSeat(t.pricePerSeatCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-accent/15 pt-2 text-[12px]">
        <dt className="text-muted">Per-account fee</dt>
        <dd className="tabular text-right">{quote.perAccountFeeCents > 0 ? usdSeat(quote.perAccountFeeCents) : "None stated"}</dd>
        <dt className="text-muted">Separate accounts</dt>
        <dd className="text-right">
          {quote.separateAccountsConfirmed === true ? "Confirmed" : quote.separateAccountsConfirmed === false ? "Not offered" : "Not confirmed"}
        </dd>
        <dt className="text-muted">Quote expires</dt>
        <dd className="text-right">{quote.expiresAt ? fmtDate(quote.expiresAt) : "Not stated"}</dd>
      </dl>

      {quote.conditions.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-ink">
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
