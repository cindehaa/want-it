// Poll Dial for live calls and run quote extraction, idempotently. Shared by GET /api/calls/[id] and
// (via refreshActiveCalls) GET /api/pool. In-memory locks guard against concurrent refreshes in one server.
import type { Call, Quote } from "@/lib/contracts";
import { all, get, put } from "@/lib/db";
import { getCall, type DialCallView } from "@/lib/dial/client";
import { extractQuote } from "@/lib/quote/extract";

export type RefreshResult = { call: Call | null; quote: Quote | null; pollError?: string };

const EXTRACTION_FAILED_PREFIX = "Extraction failed";
const MIN_POLL_GAP_MS = 1500; // GET /api/pool is polled by the UI; don't hammer Dial
const CALL_TIMEOUT_MS = 6 * 60_000; // 180s call cap + queue/ring time + slack (real time)
const TRANSCRIPT_WAIT_MS = 3 * 60_000; // call ended but Dial never produced a transcript

type State = { inflight: Map<string, Promise<RefreshResult>>; lastPoll: Map<string, number>; sweep: Promise<void> | null; endedSeenAt: Map<string, number> };
const g = globalThis as unknown as { __dialRefresh?: State };
const state = (): State => (g.__dialRefresh ??= { inflight: new Map(), lastPoll: new Map(), sweep: null, endedSeenAt: new Map() });

/** 'extracted' and 'failed' are final for automatic refresh (a failed extraction can be retried explicitly). */
export const isDone = (c: Call) => c.status === "extracted" || c.status === "failed";

export const quoteForCall = (callId: string): Quote | null => all("quotes").find((q) => q.callId === callId) ?? null;

/** A call that has a transcript but whose quote extraction errored (retry via GET /api/calls/:id?retry=1). */
export const canRetryExtraction = (c: Call) => c.status === "failed" && c.transcriptTurns.length > 0 && (c.error ?? "").startsWith(EXTRACTION_FAILED_PREFIX) && !quoteForCall(c.id);

function applyDial(call: Call, v: DialCallView): Call {
  const next: Call = { ...call, status: v.status };
  if (v.transcriptTurns && v.transcriptTurns.length > 0) {
    next.transcriptTurns = v.transcriptTurns.map((t) => ({ speaker: t.speaker, text: t.text, startMs: t.startMs }));
  }
  const ended = v.status === "ended" || v.status === "transcribed" || v.status === "failed";
  if (ended && !next.endedAt) {
    const start = v.createdAt ? new Date(v.createdAt).getTime() : NaN;
    next.endedAt = v.durationSeconds != null && !Number.isNaN(start) ? new Date(start + v.durationSeconds * 1000).toISOString() : new Date().toISOString();
  }
  if (v.status === "failed") next.error = v.error;
  return next;
}

const fail = (call: Call, error: string): Call => put("calls", { ...call, status: "failed", error, endedAt: call.endedAt ?? new Date().toISOString() });

async function doRefresh(id: string, opts: { force?: boolean; retryExtraction?: boolean }): Promise<RefreshResult> {
  const s = state();
  let call = get("calls", id);
  if (!call) return { call: null, quote: null };
  let pollError: string | undefined;

  // 1. Poll Dial for live calls that are still moving.
  if (call.source === "live" && !isDone(call) && call.dialCallId && call.status !== "transcribed") {
    const last = s.lastPoll.get(id) ?? 0;
    if (opts.force || Date.now() - last >= MIN_POLL_GAP_MS) {
      s.lastPoll.set(id, Date.now());
      const r = await getCall(call.dialCallId);
      if (r.ok) {
        call = put("calls", applyDial(call, r.data));
      } else {
        pollError = r.error;
        if (!r.retryable) call = fail(call, r.error); // 401/404/etc: will never succeed
      }
    }
    // Timeouts (real time): never leave a call spinning forever.
    if (!isDone(call) && call.status !== "transcribed") {
      const age = Date.now() - new Date(call.startedAt).getTime();
      if (call.status === "ended") {
        const seen = s.endedSeenAt.get(id) ?? Date.now();
        s.endedSeenAt.set(id, seen);
        if (Date.now() - seen > TRANSCRIPT_WAIT_MS) call = fail(call, "Call ended but Dial produced no transcript, so no quote could be extracted.");
      } else if (age > CALL_TIMEOUT_MS) {
        call = fail(call, `Timed out waiting for Dial after ${Math.round(age / 60_000)} min (last known status: ${call.status}${pollError ? `; last error: ${pollError}` : ""}).`);
      }
    }
  }

  // 2. Extraction (live after transcript arrives; replay immediately). Never twice.
  const existing = quoteForCall(call.id);
  const wantsRetry = !!opts.retryExtraction && canRetryExtraction(call);
  if (existing && call.status !== "extracted") {
    call = put("calls", { ...call, status: "extracted", error: null }); // heal a crash between put(quote) and put(call)
  } else if (!existing && (call.status === "transcribed" || wantsRetry) && call.transcriptTurns.length > 0) {
    try {
      const q = await extractQuote(call);
      if (q) {
        put("quotes", q);
        call = put("calls", { ...call, status: "extracted", error: null });
      } else {
        call = put("calls", { ...call, status: "extracted", error: "Vendor stated no price on this call; no quote was extracted." });
      }
    } catch (e) {
      call = put("calls", { ...call, status: "failed", error: `${EXTRACTION_FAILED_PREFIX}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return { call, quote: quoteForCall(call.id), pollError };
}

/** Refresh one call. Concurrent calls for the same id share one in-flight promise. */
export function refreshCall(id: string, opts: { force?: boolean; retryExtraction?: boolean } = {}): Promise<RefreshResult> {
  const s = state();
  const running = s.inflight.get(id);
  if (running) return running;
  const p = doRefresh(id, opts).finally(() => s.inflight.delete(id));
  s.inflight.set(id, p);
  return p;
}

/**
 * Refresh every non-final call (poll Dial, extract quotes). For GET /api/pool.
 * Resolves when the sweep finishes OR after `waitMs` (default 3s), whichever is first; a slow sweep
 * (e.g. an extraction in progress) keeps running in the background and the next poll sees the result.
 * Never throws.
 */
export async function refreshActiveCalls(opts: { waitMs?: number } = {}): Promise<void> {
  const s = state();
  if (!s.sweep) {
    s.sweep = (async () => {
      try {
        const active = all("calls").filter((c) => !isDone(c));
        await Promise.all(active.map((c) => refreshCall(c.id).catch(() => undefined)));
      } catch {
        /* never throw into the pool route */
      } finally {
        s.sweep = null;
      }
    })();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([s.sweep, new Promise<void>((res) => { timer = setTimeout(res, opts.waitMs ?? 3000); })]);
  if (timer) clearTimeout(timer);
}
