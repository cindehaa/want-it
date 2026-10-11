// Negotiation engine: ONE round over all test vendors, strictly one call at a time (Dial free tier = 2 concurrent
// calls and A->B uses both). Two entry points share the same core (startNextCall):
//   - POST /api/pool/negotiate      single step: next vendor not yet called (or an explicit vendorId)
//   - POST /api/pool/negotiate-all  auto-run: run state lives in kv; tickRunner() (called from GET negotiate-all,
//                                   which the UI polls) starts the next vendor whenever no call is active.
// Nothing here fabricates data: replay mode only uses real recordings from data/recorded-calls.json; a vendor
// without a recording is reported as "no_recording" and skipped.
import type { Call, Order, Pool, Quote, Vendor } from "@/lib/contracts";
import { all, get, kvGet, kvSet, newId, put } from "@/lib/db";
import { now } from "@/lib/clock";
import { POOL_ID, recomputePool } from "@/lib/pool";
import { NEGOTIATION_ORDER, VENDORS, vendorPhone, vendorPhoneEnvName } from "@/lib/vendors";
import { getDemandEvidence } from "@/lib/keewano";
import { createCall, updateNumber } from "@/lib/dial/client";
import { bestEffectiveQuote, buildInstruction, effectiveAllIn } from "@/lib/dial/prompt";
import { personaFor, vendorMode } from "@/lib/dial/vendorPersonas";
import { loadRecorded, pickRecording } from "@/lib/dial/recorded";
import { canRetryExtraction, isDone, refreshActiveCalls, refreshCall } from "@/lib/dial/refresh";

export type NegotiateMode = "live" | "replay";
export type NegotiateResult = { status: number; body: Record<string, unknown> };

const E164 = /^\+[1-9]\d{6,14}$/;
const RUN_KEY = "negotiateRun";
const MAX_ATTEMPTS = 2; // per vendor per auto-run: a failed call without a transcript is retried once, then the vendor is marked failed
const RETRY_BACKOFF_MS = 15_000; // wait before re-dialing a vendor whose last call failed (e.g. Dial concurrency limit)

// One negotiate/tick at a time per server process (calls are strictly sequential; also guards double clicks).
const g = globalThis as unknown as { __negotiateLock?: boolean };
const reply = (status: number, body: Record<string, unknown>): NegotiateResult => ({ status, body });

// ---------------------------------------------------------------------------------------------
// Per-vendor state (derived from the calls table, so it is always consistent with what actually happened)

export type VendorState =
  | "pending" // not called yet (or only failed attempts without a transcript, retries left)
  | "active" // a call to this vendor is in flight
  | "done" // call extracted into a quote
  | "no_quote" // call completed but the vendor stated no price
  | "failed" // call failed, or the transcript exists but quote extraction failed (retry via GET /api/calls/:id?retry=1)
  | "no_recording"; // replay mode only: no recorded real call exists for this vendor (nothing is fabricated)

const TERMINAL: VendorState[] = ["done", "no_quote", "failed", "no_recording"];
const noTranscriptFailure = (c: Call) => c.status === "failed" && c.transcriptTurns.length === 0;

export function classifyVendor(
  vendorId: string,
  calls: Call[],
  quotedCallIds: Set<string>,
  opts: { maxAttempts?: number; since?: string; mode?: NegotiateMode } = {},
): VendorState {
  const vcalls = calls.filter((c) => c.vendorId === vendorId);
  if (vcalls.some((c) => !isDone(c))) return "active";
  if (vcalls.some((c) => quotedCallIds.has(c.id))) return "done";
  if (vcalls.some((c) => c.status === "extracted")) return "no_quote";
  if (vcalls.some((c) => c.status === "failed" && c.transcriptTurns.length > 0)) return "failed";
  const attempts = vcalls.filter((c) => !opts.since || c.startedAt >= opts.since).length;
  if (attempts >= (opts.maxAttempts ?? Infinity)) return "failed";
  if (opts.mode === "replay" && !loadRecorded().some((e) => e.vendorId === vendorId)) return "no_recording";
  return "pending";
}

// ---------------------------------------------------------------------------------------------
// Core: start ONE call (shared by single-step POST and the auto-runner). No locking here.

type StartOpts = { mode: NegotiateMode; vendorId?: string; fromRunner?: boolean };

function liveConfigError(vendorIds: string[]): string | null {
  const vmode = vendorMode();
  const need = ["DIAL_API_KEY"];
  if (vmode === "ai") need.push("DIAL_VENDOR_NUMBER_ID", "DIAL_VENDOR_PHONE", "DIAL_FROM_NUMBER_ID");
  else {
    for (const id of vendorIds) if (!vendorPhone(id)) need.push(vendorPhoneEnvName(id));
    if (!process.env.DIAL_FROM_NUMBER_ID && !process.env.DIAL_FROM_NUMBER) need.push("DIAL_FROM_NUMBER_ID");
  }
  const missing = [...new Set(need)].filter((k) => !process.env[k]?.trim());
  return missing.length > 0 ? `Live mode (VENDOR_MODE=${vmode}) is not configured: set ${missing.join(", ")} in .env.local, or use mode=replay.` : null;
}

async function startNextCall({ mode, vendorId, fromRunner = false }: StartOpts): Promise<NegotiateResult> {
  // 0. Let finished calls settle (poll Dial / extract) before deciding what is "in progress".
  if (!fromRunner) {
    await refreshActiveCalls({ waitMs: 2500 });
    for (const c of all("calls")) if (canRetryExtraction(c)) await refreshCall(c.id, { retryExtraction: true });
  }

  const calls = all("calls");
  const busy = calls.find((c) => !isDone(c));
  if (busy) return reply(409, { error: `A call is still in progress (${busy.vendorId}, status ${busy.status}). Wait for it to finish.`, call: busy });
  if (!fromRunner) {
    const stuck = calls.find(canRetryExtraction);
    if (stuck) return reply(409, { error: `Call ${stuck.id} has a transcript but quote extraction failed (${stuck.error}). Fix the cause and GET /api/calls/${stuck.id}?retry=1 before negotiating further.`, call: stuck });
  }

  // 1. Pick the vendor: the given one, else the next in NEGOTIATION_ORDER that has not been called yet.
  //    Vendors with a quote (or a completed call) are skipped; a failed call without a transcript can be retried.
  let vendor: Vendor | undefined;
  if (vendorId) {
    vendor = VENDORS.find((v) => v.id === vendorId);
    if (!vendor) return reply(404, { error: `Unknown vendor "${vendorId}". Known: ${VENDORS.map((v) => v.id).join(", ")}.` });
  } else {
    const quoted = new Set(all("quotes").map((q) => q.callId));
    const nextId = NEGOTIATION_ORDER.find((id) => classifyVendor(id, calls, quoted) === "pending");
    vendor = VENDORS.find((v) => v.id === nextId);
    if (!vendor) return reply(409, { error: `All ${NEGOTIATION_ORDER.length} vendors have already been called (quote, no quote, or extraction failed). Pass { "vendorId": "..." } to call one again.` });
  }

  // Sequence = the vendor's slot in the round (1 = Certly ... 5 = ComplyKit). A retry after a failed call without a
  // transcript keeps the slot; an explicit repeat call to a vendor that already has a real call gets the next free number.
  const maxSeq = calls.reduce((m, c) => Math.max(m, c.sequence), 0);
  const slot = NEGOTIATION_ORDER.indexOf(vendor.id) + 1;
  const slotTaken = calls.some((c) => c.sequence === slot && !(c.vendorId === vendor!.id && noTranscriptFailure(c)));
  const sequence = slot > 0 && !slotTaken ? slot : maxSeq + 1;

  // 2. Validate config / recording BEFORE any side effects.
  const vmode = vendorMode();
  let to = "";
  if (mode === "live") {
    const cfg = liveConfigError([vendor.id]);
    if (cfg) return reply(400, { error: cfg });
    to = vmode === "ai" ? process.env.DIAL_VENDOR_PHONE!.trim() : vendorPhone(vendor.id)!.trim();
    if (!E164.test(to)) return reply(400, { error: `Vendor phone number is not E.164 (e.g. +14155550123): "${to}"` });
  }
  const recording = mode === "replay" ? pickRecording(vendor.id, sequence, new Set(calls.flatMap((c) => (c.dialCallId ? [c.dialCallId] : [])))) : null;
  if (mode === "replay" && !recording) return reply(404, { error: `No recorded call for ${vendor.name} yet` });

  // 3. Pool -> negotiating; member orders -> negotiating.
  let pool = recomputePool();
  if (pool.status === "settled") return reply(409, { error: "Pool is already settled; reset the demo to negotiate again." });
  const members = pool.memberOrderIds.map((id) => get("orders", id)).filter((o): o is Order => !!o);
  if (members.length === 0) return reply(400, { error: "No pooled orders yet; nothing to negotiate." });
  pool = put("pools", { ...pool, status: "negotiating" });
  const stamp = now().toISOString();
  const negotiating: Order[] = members.map((o) => (o.status === "held" || o.status === "pooled" ? put("orders", { ...o, status: "negotiating", poolId: pool.id, updatedAt: stamp }) : o));

  const callId = newId("call");
  const startedAt = new Date().toISOString(); // real time: this is a real call

  // 4a. Replay a recorded real call.
  if (recording) {
    const call = put("calls", {
      id: callId,
      poolId: pool.id,
      vendorId: vendor.id,
      sequence,
      dialCallId: recording.dialCallId,
      status: "transcribed",
      source: "recorded_replay",
      recordedAt: recording.recordedAt,
      instruction: recording.instruction,
      transcriptTurns: recording.transcriptTurns,
      error: null,
      startedAt,
      endedAt: recording.recordedAt,
    });
    void refreshCall(call.id); // start real extraction over the recorded transcript right away
    return reply(201, call);
  }

  // 4b. Live call. The instruction cites the best EFFECTIVE quote so far (lib/dial/prompt.ts), truthfully.
  let evidence;
  try { evidence = await getDemandEvidence(pool.category); } catch { evidence = null; }
  evidence ??= { source: "unavailable" as const, queryText: "", ranAt: null, interestedBuyers90d: null, abandonedOverPrice90d: null, medianMaxPricePerSeatCents: null, isSyntheticHistory: true, summary: "Keewano unavailable." };
  const poolCallIds = new Set(calls.filter((c) => c.poolId === pool.id).map((c) => c.id));
  const priorQuotes: Quote[] = all("quotes").filter((q) => poolCallIds.has(q.callId));
  const instruction = buildInstruction({ vendor, pool, members: negotiating, evidence, priorQuotes, now: now() });
  const header =
    vmode === "ai"
      ? `[want-it note] vendor_mode=ai: a Dial AI agent answered as ${vendor.name} (test vendor persona applied to the vendor number). Round ${sequence}.`
      : `[want-it note] vendor_mode=human: a teammate answered as ${vendor.name} (test vendor). Round ${sequence}.`;

  const base: Call = { id: callId, poolId: pool.id, vendorId: vendor.id, sequence, dialCallId: null, status: "queued", source: "live", recordedAt: null, instruction: `${header}\n\n${instruction}`, transcriptTurns: [], error: null, startedAt, endedAt: null };
  const failed = (error: string) => put("calls", { ...base, status: "failed", error, endedAt: new Date().toISOString() });

  if (vmode === "ai") {
    const persona = personaFor(vendor.id);
    if (!persona) return reply(500, { call: failed(`No vendor persona defined for ${vendor.name}`), error: `No vendor persona defined for ${vendor.name}` });
    const patched = await updateNumber(process.env.DIAL_VENDOR_NUMBER_ID!.trim(), { inboundInstruction: persona.instruction() });
    if (!patched.ok) {
      const msg = `Could not set the ${vendor.name} persona on the vendor number: ${patched.error}. No call was placed.`;
      return reply(502, { error: msg, call: failed(msg) });
    }
  }

  const created = await createCall({ to, instruction, idempotencyKey: callId });
  if (!created.ok) {
    const msg = `Dial could not place the call: ${created.error}`;
    return reply(502, { error: msg, call: failed(msg) });
  }
  const call = put("calls", { ...base, dialCallId: created.data.dialCallId, status: created.data.status === "failed" ? "failed" : "queued", error: created.data.error });
  return reply(201, call);
}

/** Single step (POST /api/pool/negotiate). 409 if another negotiate/tick is mid-flight in this process. */
export async function negotiateOnce(opts: { mode: NegotiateMode; vendorId?: string }): Promise<NegotiateResult> {
  if (g.__negotiateLock) return reply(409, { error: "A negotiate request is already being processed" });
  g.__negotiateLock = true;
  try {
    return await startNextCall(opts);
  } catch (e) {
    return reply(500, { error: `Negotiate failed: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    g.__negotiateLock = false;
  }
}

// ---------------------------------------------------------------------------------------------
// Auto-runner: run state in kv

export type RunState = {
  running: boolean;
  mode: NegotiateMode;
  order: string[];
  startedAt: string; // real time
  finishedAt: string | null;
  error: string | null; // set when the run stopped because of a configuration/pool problem
  extractionRetried: string[]; // call ids whose failed extraction was auto-retried once
};

function readRun(): RunState | null {
  try {
    const raw = kvGet(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<RunState>;
    if (typeof r.running !== "boolean" || (r.mode !== "live" && r.mode !== "replay") || !Array.isArray(r.order) || typeof r.startedAt !== "string") return null;
    return { running: r.running, mode: r.mode, order: r.order, startedAt: r.startedAt, finishedAt: r.finishedAt ?? null, error: r.error ?? null, extractionRetried: r.extractionRetried ?? [] };
  } catch {
    return null;
  }
}
const writeRun = (r: RunState) => kvSet(RUN_KEY, JSON.stringify(r));

export type VendorProgress = {
  vendorId: string;
  name: string;
  state: VendorState;
  callId: string | null; // latest call to this vendor
  callStatus: Call["status"] | null;
  source: Call["source"] | null;
  error: string | null; // call error, or the "no recording" explanation
  quote: { tiers: Quote["tiers"]; perAccountFeeCents: number; conditions: string[]; allInPerSeatCents: number | null } | null;
};

/** Run state as exposed over HTTP (no internal bookkeeping). */
export type PublicRun = Omit<RunState, "extractionRetried">;
const publicRun = (r: RunState): PublicRun => ({ running: r.running, mode: r.mode, order: r.order, startedAt: r.startedAt, finishedAt: r.finishedAt, error: r.error });

/**
 * Response body of GET/POST/DELETE /api/pool/negotiate-all. The run fields are exposed BOTH at the top level
 * ({running, mode, order, startedAt, finishedAt}) and under `run`, so either way of reading it works.
 * Before any run was started: {running: false, order, run: null, progress}.
 */
export type RunView = Partial<PublicRun> & {
  running: boolean;
  order: string[];
  run: PublicRun | null; // null until a run was ever started
  progress: {
    total: number;
    completed: number; // vendors in a terminal state (done / no_quote / failed / no_recording)
    currentVendorId: string | null; // vendor whose call is in flight
    vendors: VendorProgress[];
    best: { vendorId: string; name: string; allInPerSeatCents: number; tierPricePerSeatCents: number; perAccountFeeCents: number } | null;
  };
};

export function runView(): RunView {
  const run = readRun();
  const order = run?.order ?? NEGOTIATION_ORDER;
  const calls = all("calls");
  const quotes = all("quotes");
  const quotedCallIds = new Set(quotes.map((q) => q.callId));
  const pool: Pool | null = get("pools", POOL_ID);
  const members = pool ? pool.memberOrderIds.map((id) => get("orders", id)).filter((o): o is Order => !!o) : [];
  const poolCallIds = new Set(calls.filter((c) => !pool || c.poolId === pool.id).map((c) => c.id));
  const poolQuotes = quotes.filter((q) => poolCallIds.has(q.callId));

  const vendors: VendorProgress[] = order.map((id) => {
    const v = VENDORS.find((x) => x.id === id);
    const state = classifyVendor(id, calls, quotedCallIds, { maxAttempts: MAX_ATTEMPTS, since: run?.startedAt, mode: run?.mode });
    const last = calls.filter((c) => c.vendorId === id).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1) ?? null;
    const q = poolQuotes.filter((x) => x.vendorId === id).at(-1) ?? null;
    return {
      vendorId: id,
      name: v?.name ?? id,
      state,
      callId: last?.id ?? null,
      callStatus: last?.status ?? null,
      source: last?.source ?? null,
      error: state === "no_recording" ? `No recorded call for ${v?.name ?? id}; nothing was fabricated. Run in live mode to get a real quote.` : (last?.error ?? null),
      quote: q ? { tiers: q.tiers, perAccountFeeCents: q.perAccountFeeCents, conditions: q.conditions, allInPerSeatCents: effectiveAllIn(q, members)?.allInPerSeatCents ?? null } : null,
    };
  });
  const bestQ = bestEffectiveQuote(poolQuotes, members, { now: now() });
  const pub = run ? publicRun(run) : null;
  return {
    ...(pub ?? { running: false }),
    order,
    run: pub,
    progress: {
      total: order.length,
      completed: vendors.filter((v) => TERMINAL.includes(v.state)).length,
      currentVendorId: vendors.find((v) => v.state === "active")?.vendorId ?? null,
      vendors,
      best: bestQ ? { vendorId: bestQ.vendorId, name: VENDORS.find((v) => v.id === bestQ.vendorId)?.name ?? bestQ.vendorId, allInPerSeatCents: bestQ.allInPerSeatCents, tierPricePerSeatCents: bestQ.tierPricePerSeatCents, perAccountFeeCents: bestQ.quote.perAccountFeeCents } : null,
    },
  };
}

async function tick(): Promise<void> {
  const run = readRun();
  if (!run || !run.running) return;

  await refreshActiveCalls({ waitMs: 1500 }); // poll Dial + extract quotes for in-flight calls

  // A call whose transcript exists but whose extraction failed gets ONE automatic retry, then counts as failed.
  for (const c of all("calls")) {
    if (canRetryExtraction(c) && !run.extractionRetried.includes(c.id)) {
      run.extractionRetried.push(c.id);
      writeRun(run);
      await refreshCall(c.id, { retryExtraction: true });
    }
  }

  const calls = all("calls");
  if (calls.some((c) => !isDone(c))) return; // strictly sequential: wait for the in-flight call

  const quotedCallIds = new Set(all("quotes").map((q) => q.callId));
  const next = run.order.find((id) => classifyVendor(id, calls, quotedCallIds, { maxAttempts: MAX_ATTEMPTS, since: run.startedAt, mode: run.mode }) === "pending");
  if (!next) {
    writeRun({ ...run, running: false, finishedAt: new Date().toISOString() });
    return;
  }

  // Back off before re-dialing a vendor whose previous attempt failed.
  const lastFail = calls.filter((c) => c.vendorId === next && noTranscriptFailure(c)).sort((a, b) => (a.endedAt ?? "").localeCompare(b.endedAt ?? "")).at(-1);
  if (lastFail?.endedAt && Date.now() - new Date(lastFail.endedAt).getTime() < RETRY_BACKOFF_MS) return;

  const r = await startNextCall({ mode: run.mode, vendorId: next, fromRunner: true });
  if (r.status === 201 || r.status === 409) return; // started, or transient (try again next tick)
  if (r.status === 502 || r.status === 500) return; // a failed Call was recorded (attempt counted); retried after backoff, then marked failed
  // Configuration / pool problem (400/404): stop the run and say why; nothing more would succeed.
  writeRun({ ...run, running: false, finishedAt: new Date().toISOString(), error: typeof r.body.error === "string" ? r.body.error : `Runner stopped (HTTP ${r.status})` });
}

/**
 * If a run is active and no call is in flight, start the next vendor's call; when every vendor has reached a
 * terminal state, mark the run finished. Safe to call on every poll: overlapping ticks are skipped.
 */
export async function tickRunner(): Promise<void> {
  if (g.__negotiateLock) return;
  g.__negotiateLock = true;
  try {
    await tick();
  } catch (e) {
    const run = readRun();
    if (run?.running) writeRun({ ...run, running: false, finishedAt: new Date().toISOString(), error: `Runner crashed: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    g.__negotiateLock = false;
  }
}

/** POST /api/pool/negotiate-all. Validates up front (no side effects on failure), persists the run, takes the first step. */
export async function startRun(mode: NegotiateMode): Promise<NegotiateResult> {
  const existing = readRun();
  if (existing?.running) {
    if (existing.mode !== mode) return reply(409, { error: `A ${existing.mode} run is already in progress; wait for it to finish or DELETE /api/pool/negotiate-all first.`, ...runView() });
    await tickRunner();
    return reply(200, { alreadyRunning: true, ...runView() });
  }
  if (mode === "live") {
    const cfg = liveConfigError(NEGOTIATION_ORDER);
    if (cfg) return reply(400, { error: cfg });
  }
  const pool = recomputePool();
  if (pool.status === "settled") return reply(409, { error: "Pool is already settled; reset the demo to negotiate again." });
  if (pool.memberOrderIds.length === 0) return reply(400, { error: "No pooled orders yet; nothing to negotiate." });

  writeRun({ running: true, mode, order: [...NEGOTIATION_ORDER], startedAt: new Date().toISOString(), finishedAt: null, error: null, extractionRetried: [] });
  await tickRunner();
  return reply(200, { started: true, ...runView() });
}

/** DELETE /api/pool/negotiate-all: stop starting new calls. A call already in flight is left to finish (Dial calls cannot be canceled here). */
export function stopRun(): NegotiateResult {
  const run = readRun();
  if (run?.running) writeRun({ ...run, running: false, finishedAt: new Date().toISOString(), error: "Stopped by user" });
  return reply(200, { stopped: !!run?.running, ...runView() });
}
