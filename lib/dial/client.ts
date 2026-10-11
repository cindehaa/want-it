// Thin Dial (getdial.ai) REST client. Verified against docs.getdial.ai (2026-10-11):
//   POST {base}/calls            -> 201 { call }   (200 on idempotent replay)
//   GET  {base}/calls/{id}       -> 200 { call }   ("Get a call" page shows a bare Call object in some examples; we accept both)
//   GET  {base}/calls            -> 200 { calls: [...] } (newest first, max 100)
// where base = https://api.getdial.ai/api/v1. Call.status is an OBJECT { state, terminationType, ... }, not a string.
// No webhooks on localhost -> callers poll getCall().
//
// Errors are returned as values ({ ok: false }), never thrown into route handlers.
import type { Call } from "@/lib/contracts";

type CallStatus = Call["status"]; // contracts exports CallStatus only as a zod value

const DEFAULT_BASE = "https://api.getdial.ai/api/v1";
const TIMEOUT_MS = 10_000;

export type DialResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; httpStatus?: number; code?: string; retryable: boolean };

export type DialTurn = { speaker: string; text: string; startMs: number };

/** Our normalized view of a Dial call. */
export type DialCallView = {
  dialCallId: string;
  status: CallStatus; // queued | in_progress | ended | transcribed | failed (never 'extracted'; that's ours)
  state: string; // raw Dial state, e.g. "In-Progress"
  terminationType: string | null; // completed | busy | no-answer | failed | canceled
  durationSeconds: number | null;
  createdAt: string | null;
  transcript: string | null;
  transcriptTurns: DialTurn[] | null; // null until the call has a transcript
  recordingAvailable: boolean | null;
  from: string | null;
  to: string | null;
  direction: string | null;
  callStartedAt: string | null;
  error: string | null; // set when status === 'failed'
};

// ---------------------------------------------------------------------------------------------
// Normalization

type RawCall = {
  id?: unknown;
  status?: unknown;
  duration?: unknown;
  createdAt?: unknown;
  transcript?: unknown;
  transcriptTurns?: unknown;
  recordingAvailable?: unknown;
  from?: unknown;
  to?: unknown;
  direction?: unknown;
  callStartedAt?: unknown;
};

const FAILED_TERMINATIONS: Record<string, string> = {
  busy: "the vendor line was busy",
  "no-answer": "nobody answered the call",
  failed: "the call failed on Dial's side",
  canceled: "the call was canceled",
};

function parseTurns(raw: unknown): DialTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: DialTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) continue;
    turns.push({
      speaker: typeof o.speaker === "string" ? o.speaker : "unknown",
      text: o.text,
      startMs: typeof o.startMs === "number" ? o.startMs : 0,
    });
  }
  return turns;
}

/** Fallback when Dial returns a flat transcript but no timed turns ("agent: hi"). Speaker unknown if unlabeled. */
function turnsFromFlatTranscript(transcript: string): DialTurn[] {
  const turns: DialTurn[] = [];
  transcript.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    const m = l.match(/^(agent|user|transfer_target|assistant|human)\s*[:\-]\s*(.+)$/i);
    turns.push(m ? { speaker: m[1].toLowerCase(), text: m[2], startMs: i } : { speaker: "unknown", text: l, startMs: i });
  });
  return turns;
}

export function normalizeCall(raw: RawCall): DialCallView | null {
  if (!raw || typeof raw.id !== "string") return null;

  // status: object per docs; tolerate a bare string in case of API drift.
  let state = "Unknown";
  let terminationType: string | null = null;
  if (typeof raw.status === "string") {
    state = raw.status;
  } else if (raw.status && typeof raw.status === "object") {
    const s = raw.status as Record<string, unknown>;
    if (typeof s.state === "string") state = s.state;
    if (typeof s.terminationType === "string") terminationType = s.terminationType;
  }
  const st = state.toLowerCase().replace(/[_\s]/g, "-");

  const transcript = typeof raw.transcript === "string" && raw.transcript.trim() ? raw.transcript : null;
  let turns = parseTurns(raw.transcriptTurns);
  if ((!turns || turns.length === 0) && transcript) turns = turnsFromFlatTranscript(transcript);
  const hasTranscript = !!turns && turns.length > 0;

  let status: CallStatus;
  let error: string | null = null;
  if (st === "terminated" || st === "completed" || st === "ended") {
    const tt = (terminationType ?? "completed").toLowerCase();
    if (FAILED_TERMINATIONS[tt]) {
      status = "failed";
      error = `Dial: ${FAILED_TERMINATIONS[tt]} (${tt}). No quote was obtained.`;
    } else {
      status = hasTranscript ? "transcribed" : "ended";
    }
  } else if (st === "in-progress" || st === "inprogress" || st === "active") {
    status = "in_progress";
  } else if (st === "queued" || st === "ringing") {
    status = "queued"; // not connected yet (contract has no 'ringing')
  } else if (st === "failed" || st === "canceled" || st === "cancelled") {
    status = "failed";
    error = `Dial: call ${st}. No quote was obtained.`;
  } else {
    status = "in_progress"; // "Unknown": keep polling; the refresh timeout will fail it if it never settles
  }

  return {
    dialCallId: raw.id,
    recordingAvailable: typeof raw.recordingAvailable === "boolean" ? raw.recordingAvailable : null,
    from: typeof raw.from === "string" ? raw.from : null,
    to: typeof raw.to === "string" ? raw.to : null,
    direction: typeof raw.direction === "string" ? raw.direction : null,
    callStartedAt: typeof raw.callStartedAt === "string" ? raw.callStartedAt : null,
    status,
    state,
    terminationType,
    durationSeconds: typeof raw.duration === "number" ? raw.duration : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
    transcript,
    transcriptTurns: hasTranscript ? turns : null,
    error,
  };
}

// ---------------------------------------------------------------------------------------------
// HTTP

/** Base URLs to try, in order. Docs say /api/v1; a guide example used /v1, so fall back on 404. */
let resolvedBase: string | null = null;
function candidateBases(): string[] {
  const configured = normalizeBase(process.env.DIAL_BASE_URL || DEFAULT_BASE);
  const alt = configured.endsWith("/api/v1") ? configured.replace(/\/api\/v1$/, "/v1") : "https://api.getdial.ai/v1";
  const first = resolvedBase ?? configured;
  return first === configured ? [configured, alt] : [first, configured, alt].filter((v, i, a) => a.indexOf(v) === i);
}
function normalizeBase(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}
export const dialBaseInUse = () => resolvedBase ?? normalizeBase(process.env.DIAL_BASE_URL || DEFAULT_BASE);

function friendlyError(status: number, code: string | undefined, msg: string): string {
  const base = `Dial ${status}${code ? ` ${code}` : ""}: ${msg}`;
  switch (status) {
    case 401: return `${base} (DIAL_API_KEY missing or invalid)`;
    case 402: return `${base} (Dial account has insufficient credit)`;
    case 403: return `${base} (destination region unsupported; nothing was dialed)`;
    case 429: return `${base} (Dial concurrent-call limit reached; wait for the other call to finish)`;
    default: return base;
  }
}

async function dialFetch(method: "GET" | "POST" | "PATCH", path: string, opts: { body?: unknown; idempotencyKey?: string } = {}): Promise<DialResult<unknown>> {
  const key = process.env.DIAL_API_KEY;
  if (!key) return { ok: false, error: "DIAL_API_KEY is not set", retryable: false };

  let last: DialResult<unknown> = { ok: false, error: "no request made", retryable: false };
  for (const base of candidateBases()) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctl.signal,
        cache: "no-store",
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
      if (res.ok) {
        resolvedBase = base;
        return { ok: true, data: json };
      }
      const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
      const errField = j.error;
      const code = typeof j.code === "string" ? j.code : errField && typeof errField === "object" && typeof (errField as Record<string, unknown>).code === "string" ? ((errField as Record<string, unknown>).code as string) : undefined;
      const msg = typeof errField === "string" ? errField : errField && typeof errField === "object" && typeof (errField as Record<string, unknown>).message === "string" ? ((errField as Record<string, unknown>).message as string) : typeof j.message === "string" ? j.message : text.slice(0, 200) || res.statusText;
      last = { ok: false, error: friendlyError(res.status, code, msg), httpStatus: res.status, code, retryable: res.status >= 500 || res.status === 429 || res.status === 409 };
      if (res.status === 404) continue; // maybe wrong base path; try the next candidate
      return last;
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { ok: false, error: aborted ? `Dial request timed out after ${TIMEOUT_MS / 1000}s` : `Dial request failed: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

// ---------------------------------------------------------------------------------------------
// Public API

export type CreateCallInput = {
  to: string; // E.164
  instruction: string; // outboundInstruction
  fromNumber?: string; // phone-number ID, E.164 or nickname (Dial's `fromNumber` accepts all three). Default: DIAL_FROM_NUMBER_ID, then DIAL_FROM_NUMBER
  idempotencyKey?: string;
  maxCallDurationSeconds?: number; // 60-3600 (free accounts capped at 300); default 180
  language?: string;
  voiceGender?: "male" | "female";
};

export async function createCall(input: CreateCallInput): Promise<DialResult<DialCallView>> {
  const fromNumber = input.fromNumber ?? (process.env.DIAL_FROM_NUMBER_ID || process.env.DIAL_FROM_NUMBER);
  if (!fromNumber) return { ok: false, error: "DIAL_FROM_NUMBER_ID (or DIAL_FROM_NUMBER) is not set; Dial requires a from number", retryable: false };
  const body: Record<string, unknown> = {
    to: input.to,
    outboundInstruction: input.instruction,
    fromNumber,
    maxCallDurationSeconds: input.maxCallDurationSeconds ?? 180,
  };
  if (input.language) body.language = input.language;
  if (input.voiceGender) body.voiceGender = input.voiceGender;
  const r = await dialFetch("POST", "/calls", { body, idempotencyKey: input.idempotencyKey });
  if (!r.ok) return r;
  const raw = ((r.data as { call?: RawCall } | null)?.call ?? r.data) as RawCall;
  const view = normalizeCall(raw);
  return view ? { ok: true, data: view } : { ok: false, error: "Dial returned an unexpected response to create-call (no call id)", retryable: false };
}

export async function getCall(dialCallId: string): Promise<DialResult<DialCallView>> {
  const r = await dialFetch("GET", `/calls/${encodeURIComponent(dialCallId)}`);
  if (!r.ok) return r;
  const raw = ((r.data as { call?: RawCall } | null)?.call ?? r.data) as RawCall;
  const view = normalizeCall(raw);
  return view ? { ok: true, data: view } : { ok: false, error: "Dial returned an unexpected response to get-call (no call id)", retryable: true };
}

/** Used by the smoke script to validate auth without placing a call. */
export async function listCalls(query: Record<string, string> = {}): Promise<DialResult<{ count: number; calls: DialCallView[] }>> {
  const qs = new URLSearchParams(query).toString();
  const r = await dialFetch("GET", `/calls${qs ? `?${qs}` : ""}`);
  if (!r.ok) return r;
  const rawCalls = (r.data as { calls?: RawCall[] } | null)?.calls ?? [];
  const calls = rawCalls.map(normalizeCall).filter((c): c is DialCallView => !!c);
  return { ok: true, data: { count: rawCalls.length, calls } };
}

// ---------------------------------------------------------------------------------------------
// Phone numbers (used to swap the AI vendor persona on number B before each call)

export type DialNumber = { id: string; number: string | null; nickname: string | null; inboundInstruction: string | null };

function normalizeNumber(raw: unknown): DialNumber | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    number: typeof o.number === "string" ? o.number : null,
    nickname: typeof o.nickname === "string" ? o.nickname : null,
    inboundInstruction: typeof o.inboundInstruction === "string" ? o.inboundInstruction : null,
  };
}

/** PATCH /numbers/{id}. Takes effect on the next inbound call; does not affect calls in progress. */
export async function updateNumber(numberId: string, patch: { inboundInstruction?: string; inboundVoiceGender?: "male" | "female"; nickname?: string | null }): Promise<DialResult<DialNumber>> {
  const r = await dialFetch("PATCH", `/numbers/${encodeURIComponent(numberId)}`, { body: patch });
  if (!r.ok) return r;
  const n = normalizeNumber((r.data as { number?: unknown } | null)?.number ?? r.data);
  return n ? { ok: true, data: n } : { ok: false, error: "Dial returned an unexpected response to update-number", retryable: false };
}

export async function listNumbers(): Promise<DialResult<DialNumber[]>> {
  const r = await dialFetch("GET", "/numbers");
  if (!r.ok) return r;
  const raw = Array.isArray(r.data) ? r.data : ((r.data as { numbers?: unknown[] } | null)?.numbers ?? []);
  return { ok: true, data: raw.map(normalizeNumber).filter((n): n is DialNumber => !!n) };
}

/** Authenticated WAV recording download. Verified against the real API, including byte ranges. */
export async function getRecording(dialCallId: string, range?: string): Promise<Response> {
  const key = process.env.DIAL_API_KEY;
  if (!key) return new Response(null, { status: 503 });
  const response = await fetch(`${candidateBases()[0]}/calls/${encodeURIComponent(dialCallId)}/recording`, {
    headers: { Authorization: `Bearer ${key}`, ...(range ? { Range: range } : {}) },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
    redirect: "manual",
  });
  if (![301, 302, 303, 307, 308].includes(response.status)) return response;
  const location = response.headers.get("location");
  await response.body?.cancel();
  if (!location) throw new Error("Dial recording redirect has no location");
  const target = new URL(location);
  if (target.protocol !== "https:" || target.hostname !== "t3.storageapi.dev" || target.username || target.password) {
    throw new Error("Unexpected recording storage destination");
  }
  // The storage URL is already signed. Never send the Dial bearer key to storage.
  return fetch(target.href, {
    headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(30_000), cache: "no-store", redirect: "error",
  });
}

let inboundCache: { key: string; expires: number; pending: Promise<DialCallView[]> } | null = null;

/** Both legs have separate ids. Match only an unambiguous reversed pair at the same start time. */
export async function vendorLegFor(buyer: DialCallView): Promise<string | null> {
  if (buyer.direction !== "outbound" || !buyer.from || !buyer.to || !buyer.callStartedAt) return null;
  const key = `${process.env.DIAL_API_KEY ?? ""}:${dialBaseInUse()}`;
  if (!inboundCache || inboundCache.key !== key || inboundCache.expires < Date.now()) {
    inboundCache = { key, expires: Date.now() + 5000, pending: listCalls({ direction: "inbound" }).then((r) => r.ok ? r.data.calls : []) };
  }
  const started = Date.parse(buyer.callStartedAt);
  const matches = (await inboundCache.pending).filter((c) =>
    c.direction === "inbound" && c.from === buyer.to && c.to === buyer.from && c.callStartedAt &&
    Math.abs(Date.parse(c.callStartedAt) - started) < 5000,
  );
  // Dial's inbound leg normally retains the caller/callee order instead of reversing it.
  const sameDirection = (await inboundCache.pending).filter((c) =>
    c.direction === "inbound" && c.from === buyer.from && c.to === buyer.to && c.callStartedAt &&
    Math.abs(Date.parse(c.callStartedAt) - started) < 5000,
  );
  const candidates = [...matches, ...sameDirection].filter((c, i, a) => a.findIndex((x) => x.dialCallId === c.dialCallId) === i);
  return candidates.length === 1 ? candidates[0].dialCallId : null;
}
