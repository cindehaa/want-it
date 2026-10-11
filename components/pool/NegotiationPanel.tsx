"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, PoolView, Quote } from "@/lib/contracts";
import type { PrivatePolicy } from "@/lib/dial/vendorPersonas";
import { getJson, postJson } from "./api";
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

export default function NegotiationPanel({ view, onChanged }: { view: PoolView; onChanged: () => void }) {
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
  const latestId = calls[calls.length - 1]?.id;
  const busyCall = calls.some((c) => c.status !== "extracted" && c.status !== "failed");
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
              onChanged={onChanged}
            />
          ))}
        </ol>
      )}

      {personas && personas.personas.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          {personas.personas.map((p) => (
            <PolicyDisclosure key={p.vendorId} persona={p} mode={personas.vendorMode} />
          ))}
        </div>
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
  onChanged,
}: {
  call: Call;
  vendorName: string;
  quote: Quote | undefined;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const st = STATUS[call.status];
  const mode = callVendorMode(call);
  const extractionFailed = call.status === "failed" && !!call.error?.startsWith("Extraction failed");
  const canRecord = call.source === "live" && (call.status === "extracted" || (call.status === "transcribed" && call.transcriptTurns.length > 0));
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
        <Badge tone="neutral">{mode === "ai" ? "Simulated vendor · AI agent" : mode === "human" ? "Test vendor · human" : "test vendor"}</Badge>
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
          <div role="alert" className="mb-2 break-words rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
            {extractionFailed ? call.error : <>Call failed{call.error ? `: ${call.error}` : "."}</>} No quote from this call.
            {extractionFailed && <RetryExtraction callId={call.id} onChanged={onChanged} />}
          </div>
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

        {canRecord && <SaveRecording callId={call.id} />}
      </div>
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
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      {state === "saved" ? (
        <span role="status" className="text-xs font-medium text-accent-strong">
          Saved for replay &#10003;
        </span>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
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
