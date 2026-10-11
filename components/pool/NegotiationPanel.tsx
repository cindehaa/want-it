"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, PoolView, Quote } from "@/lib/contracts";
import type { PrivatePolicy } from "@/lib/dial/vendorPersonas";
import { getJson, postJson } from "./api";
import { fmtDate, fmtDateTime, fmtMmSs, usd, usdSeat } from "./format";
import type { Phase } from "./Story";
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

type Pending = null | "next" | "replay";

type VendorMode = "ai" | "human";
type PersonaView = { vendorId: string; displayName: string; privatePolicy: PrivatePolicy };
type PersonasPayload = { vendorMode: VendorMode; personas: PersonaView[] };

function parsePersonas(v: unknown): PersonasPayload | null {
  const o = v as Partial<PersonasPayload> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.personas)) return null;
  const personas = o.personas.filter((p) => !!p && typeof p.vendorId === "string" && !!p.privatePolicy);
  return { vendorMode: o.vendorMode === "human" ? "human" : "ai", personas };
}

/** The first line of Call.instruction states the vendor mode ("vendor_mode=ai" | "vendor_mode=human"). */
function callVendorMode(call: Call): VendorMode | null {
  const m = /vendor_mode=(ai|human)/.exec(call.instruction.split("\n", 1)[0] ?? "");
  return m ? (m[1] as VendorMode) : null;
}

const BTN = "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY = `${BTN} bg-accent text-white hover:bg-accent-strong`;
const BTN_SECONDARY = `${BTN} border border-line bg-white text-ink hover:bg-canvas`;

export default function NegotiationPanel({ view, phase, onChanged }: { view: PoolView; phase: Phase; onChanged: () => void }) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [personas, setPersonas] = useState<PersonasPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getJson("/api/vendors/personas").then((res) => {
      if (cancelled || !res.ok) return;
      const parsed = parsePersonas(res.data);
      if (parsed) setPersonas(parsed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const calls = [...view.calls].sort((a, b) => a.sequence - b.sequence);
  const busyCall = calls.some((c) => c.status === "queued" || c.status === "in_progress");
  const settled = phase === "done";
  const vendorName = (id: string) => view.vendors.find((v) => v.id === id)?.name ?? id;
  // Exactly one primary button on the page: here until a quote exists, then "Settle pool" takes over.
  const primaryHere = phase === "negotiate";

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
    <div>
      <p className="max-w-[60ch] text-[14px] leading-relaxed text-muted">
        {calls.length === 0
          ? "The agent phones Certly first, then calls Vantly with Certly's price in hand. Both are test vendors, answered by an AI agent."
          : "The agent phones each vendor with the demand evidence, then calls the next one with the best price so far."}
      </p>

      {!settled && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => run("next", "/api/pool/negotiate", {})}
            disabled={pending !== null || busyCall}
            className={primaryHere ? BTN_PRIMARY : BTN_SECONDARY}
          >
            {pending === "next" && <Spinner />}
            Call next vendor
          </button>
          <button
            type="button"
            onClick={() => run("replay", "/api/pool/negotiate", { mode: "replay" })}
            disabled={pending !== null || busyCall}
            className={BTN_SECONDARY}
          >
            {pending === "replay" && <Spinner />}
            Use recorded call
          </button>
          {busyCall && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
              <Dot className="animate-pulse bg-warn" /> Call in progress
            </span>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 break-words rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      {calls.length > 0 && (
        <ol className="mt-5 divide-y divide-line border-y border-line">
          {calls.map((c) => (
            <CallBlock
              key={c.id}
              call={c}
              vendorName={vendorName(c.vendorId)}
              quote={view.quotes.find((q) => q.callId === c.id)}
              seatsInPool={view.pool.totalSeats}
              now={view.now}
              expanded={open[c.id] ?? false}
              onToggle={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
              onChanged={onChanged}
            />
          ))}
        </ol>
      )}

      {personas && personas.personas.length > 0 && (
        <div className="mt-4 space-y-2">
          {personas.personas.map((p) => (
            <PolicyDisclosure key={p.vendorId} persona={p} mode={personas.vendorMode} />
          ))}
        </div>
      )}
    </div>
  );
}

function callMinutes(call: Call): string | null {
  if (call.status === "queued" || call.status === "in_progress") return null;
  let ms = 0;
  if (call.endedAt) ms = new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime();
  if (!(ms > 0)) {
    const last = call.transcriptTurns[call.transcriptTurns.length - 1];
    ms = last ? last.startMs : 0;
  }
  return ms > 0 ? fmtMmSs(ms) : null;
}

/** One line: "$21/seat at 96 seats · $40 per-account fee · valid 7 days". */
function quoteLine(quote: Quote, seatsInPool: number, now: string): string {
  const tiers = [...quote.tiers].sort((a, b) => a.minSeats - b.minSeats);
  const reached = tiers.filter((t) => seatsInPool >= t.minSeats).sort((a, b) => a.pricePerSeatCents - b.pricePerSeatCents)[0];
  const parts: string[] = [];
  if (reached) parts.push(`${usd(reached.pricePerSeatCents)}/seat at ${seatsInPool} seats`);
  else if (tiers[0]) parts.push(`from ${usd(tiers[0].pricePerSeatCents)}/seat at ${tiers[0].minSeats}+ seats (pool is below it)`);
  parts.push(quote.perAccountFeeCents > 0 ? `${usd(quote.perAccountFeeCents)} per-account fee` : "no fees stated");
  if (quote.separateAccountsConfirmed !== true) parts.push(quote.separateAccountsConfirmed === false ? "no separate accounts" : "separate accounts not confirmed");
  if (quote.expiresAt) {
    const days = Math.round((new Date(quote.expiresAt).getTime() - new Date(now).getTime()) / 86_400_000);
    parts.push(days >= 1 ? `valid ${days} days` : `expires ${fmtDate(quote.expiresAt)}`);
  } else {
    parts.push("expiry not stated");
  }
  return parts.join(" · ");
}

function CallBlock({
  call,
  vendorName,
  quote,
  seatsInPool,
  now,
  expanded,
  onToggle,
  onChanged,
}: {
  call: Call;
  vendorName: string;
  quote: Quote | undefined;
  seatsInPool: number;
  now: string;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const st = STATUS[call.status];
  const mode = callVendorMode(call);
  const extractionFailed = call.status === "failed" && !!call.error?.startsWith("Extraction failed");
  const canRecord = call.source === "live" && (call.status === "extracted" || (call.status === "transcribed" && call.transcriptTurns.length > 0));
  const scroller = useRef<HTMLDivElement>(null);
  const [terms, setTerms] = useState(false);
  const turns = call.transcriptTurns.length;
  const duration = callMinutes(call);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [turns, expanded]);

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[16px] font-semibold tracking-tight">{vendorName}</span>
        {call.source === "live" ? (
          <Badge tone="ink">Live call</Badge>
        ) : (
          <Badge tone="warn">Recorded call{call.recordedAt ? ` · ${fmtDateTime(call.recordedAt)}` : ""}</Badge>
        )}
        {duration && <span className="tabular text-xs text-muted">{duration}</span>}
        {call.status !== "extracted" && (
          <Badge tone={st.tone}>
            {st.live && call.status !== "ended" && call.status !== "transcribed" ? <Dot className="animate-pulse bg-current" /> : null}
            {st.label}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-faint">
          {mode === "ai" ? "Simulated vendor (AI agent)" : mode === "human" ? "Test vendor (human)" : "Test vendor"}
        </span>
      </div>

      {call.status === "failed" && (
        <div role="alert" className="mt-2 break-words rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {extractionFailed ? call.error : <>Call failed{call.error ? `: ${call.error}` : "."}</>} No quote from this call.
          {extractionFailed && <RetryExtraction callId={call.id} onChanged={onChanged} />}
        </div>
      )}

      {quote ? (
        <>
          <p className="tabular mt-1.5 text-[15px] font-medium leading-snug">{quoteLine(quote, seatsInPool, now)}</p>
          {quote.evidence && (
            <blockquote className="mt-2 max-w-[62ch] break-words border-l-2 border-accent/50 pl-3 text-[14px] leading-snug text-muted">
              &ldquo;{quote.evidence}&rdquo;
            </blockquote>
          )}
        </>
      ) : (
        call.status !== "failed" && (
          <p className="mt-1.5 text-[13px] text-muted">
            {call.status === "queued" || call.status === "in_progress"
              ? `Calling ${vendorName}. The quote appears when the call ends.`
              : "Reading the transcript to extract the quote."}
          </p>
        )
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {turns > 0 && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="text-xs font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {expanded ? "Hide transcript" : `Read transcript (${turns} turns)`}
          </button>
        )}
        {quote && (
          <button
            type="button"
            onClick={() => setTerms((t) => !t)}
            aria-expanded={terms}
            className="text-xs font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {terms ? "Hide tiers and terms" : "Tiers and terms"}
          </button>
        )}
        {canRecord && <SaveRecording callId={call.id} />}
      </div>

      {expanded && turns > 0 && (
        <div ref={scroller} className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1" tabIndex={0} aria-label="Call transcript">
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

      {terms && quote && <QuoteTerms quote={quote} />}
    </li>
  );
}

function SaveRecording({ callId }: { callId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    const res = await postJson(`/api/calls/${encodeURIComponent(callId)}/record`, {});
    if (res.ok) {
      setState("saved");
    } else {
      setState("idle");
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {state === "saved" ? (
        <span role="status" className="text-xs font-medium text-accent-strong">
          Saved for replay &#10003;
        </span>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "saving" && <Spinner />}
          Save as fallback recording
        </button>
      )}
      {error && (
        <span role="alert" className="break-words text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function RetryExtraction({ callId, onChanged }: { callId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await getJson(`/api/calls/${encodeURIComponent(callId)}?retry=1`);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const call = (res.data as { call?: { status?: string; error?: string | null } } | null)?.call;
    if (call?.status === "failed" && call.error) setError(call.error);
    onChanged();
  }

  return (
    <>
      {" "}
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Spinner />}
        Retry extraction
      </button>
      {error && <span className="mt-1 block">{error}</span>}
    </>
  );
}

function TierList({ tiers }: { tiers: PrivatePolicy["openingTiers"] }) {
  return (
    <ul className="tabular space-y-0.5">
      {[...tiers]
        .sort((a, b) => a.minSeats - b.minSeats)
        .map((t) => (
          <li key={t.minSeats}>
            {usdSeat(t.pricePerSeatCents)} <span className="text-muted">at {t.minSeats}+ seats</span>
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
    <div className="rounded-md border border-line bg-canvas/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="text-left text-xs text-muted hover:text-ink"
        >
          <span aria-hidden className="mr-1 inline-block w-2.5 text-faint">
            {open ? "▾" : "▸"}
          </span>
          <span className="font-medium text-ink">{persona.displayName}</span>: Vendor&rsquo;s private pricing policy (hidden from our buyer agent)
        </button>
        <span className="ml-auto">
          <Badge tone="neutral">{mode === "ai" ? "Simulated vendor · AI agent" : "Test vendor · human"}</Badge>
        </span>
      </div>

      {open && (
        <div id={panelId} className="border-t border-line px-2.5 py-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="text-muted">List price</dt>
            <dd className="tabular text-right">{usdSeat(p.listPricePerSeatCents)} per seat</dd>
            <dt className="text-muted">Opening tiers</dt>
            <dd className="text-right">
              <TierList tiers={p.openingTiers} />
            </dd>
            <dt className="text-muted">Floor tiers</dt>
            <dd className="text-right">
              <TierList tiers={p.floorTiers} />
            </dd>
            <dt className="text-muted">Per-account fee</dt>
            <dd className="text-right">
              <span className="tabular">{p.perAccountFeeCents > 0 ? usdSeat(p.perAccountFeeCents) : "None"}</span>
              {p.perAccountFeeCents > 0 && p.perAccountFeeNote && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{p.perAccountFeeNote}</span>}
            </dd>
          </dl>
          {p.concessions.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="text-[12px] text-muted">Concessions</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-snug text-ink">
                {p.concessions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function QuoteTerms({ quote }: { quote: Quote }) {
  const tiers = [...quote.tiers].sort((a, b) => a.minSeats - b.minSeats);
  return (
    <div className="mt-3 max-w-[460px] rounded-md bg-canvas/70 p-3">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-2 font-medium">Pool size</th>
            <th className="py-1 text-right font-medium">Price per seat</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.minSeats} className="border-t border-line">
              <td className="tabular py-1 pr-2">{t.minSeats}+ seats</td>
              <td className="tabular py-1 text-right font-medium">{usdSeat(t.pricePerSeatCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-2 text-[12px]">
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
      <p className="mt-2 text-[11px] text-faint">Supplier-stated, with transcript evidence.</p>
    </div>
  );
}
