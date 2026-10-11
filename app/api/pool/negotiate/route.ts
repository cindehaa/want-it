// POST /api/pool/negotiate  body: { mode?: 'live' | 'replay' }
// Starts the next call in the sequence (1 Certly, 2 Vantly, 3 Certly callback). Returns the Call.
//   live   -> Dial outbound call (buyer agent A -> vendor). VENDOR_MODE=ai (default): a Dial AI agent answers on
//             vendor number B with the vendor persona (set via PATCH /numbers/{id}); VENDOR_MODE=human: dials CERTLY_PHONE/VANTLY_PHONE.
//   replay -> a previously RECORDED real call from data/recorded-calls.json, stored as source 'recorded_replay'.
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Call, Order } from "@/lib/contracts";
import { all, get, newId, put } from "@/lib/db";
import { now } from "@/lib/clock";
import { recomputePool } from "@/lib/pool";
import { VENDORS, vendorPhone } from "@/lib/vendors";
import { getDemandEvidence } from "@/lib/keewano";
import { createCall, updateNumber } from "@/lib/dial/client";
import { buildInstruction } from "@/lib/dial/prompt";
import { personaFor, vendorMode } from "@/lib/dial/vendorPersonas";
import { pickRecording } from "@/lib/dial/recorded";
import { canRetryExtraction, isDone, refreshActiveCalls, refreshCall } from "@/lib/dial/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEQUENCE = ["certly", "vantly", "certly"] as const;
const E164 = /^\+[1-9]\d{6,14}$/;
const Body = z.object({ mode: z.enum(["live", "replay"]).optional() });

const g = globalThis as unknown as { __negotiating?: boolean };
const reply = (body: Record<string, unknown> | Call, status: number) => NextResponse.json(body, { status });

export async function POST(req: Request) {
  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* empty body is fine */ }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return reply({ error: "Body must be { mode?: 'live' | 'replay' }" }, 400);

  if (g.__negotiating) return reply({ error: "A negotiate request is already being processed" }, 409);
  g.__negotiating = true;
  try {
    return await negotiate(parsed.data.mode ?? "live");
  } catch (e) {
    return reply({ error: `Negotiate failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
  } finally {
    g.__negotiating = false;
  }
}

async function negotiate(mode: "live" | "replay"): Promise<NextResponse> {
  // 0. Let finished calls settle (poll Dial / extract) before deciding what is "in progress".
  await refreshActiveCalls({ waitMs: 2500 });
  for (const c of all("calls")) if (canRetryExtraction(c)) await refreshCall(c.id, { retryExtraction: true });

  const calls = all("calls");
  const busy = calls.find((c) => !isDone(c));
  if (busy) return reply({ error: `A call is still in progress (${busy.vendorId}, status ${busy.status}). Wait for it to finish.`, call: busy }, 409);
  const stuck = calls.find(canRetryExtraction);
  if (stuck) return reply({ error: `Call ${stuck.id} has a transcript but quote extraction failed (${stuck.error}). Fix the cause and GET /api/calls/${stuck.id}?retry=1 before negotiating further.`, call: stuck }, 409);

  // Failed calls with no transcript don't consume a round (so a failed live call can be retried or replayed).
  const rounds = calls.filter((c) => !(c.status === "failed" && c.transcriptTurns.length === 0)).length;
  const sequence = rounds + 1;
  if (sequence > SEQUENCE.length) return reply({ error: `All ${SEQUENCE.length} negotiation rounds are done.` }, 409);
  const vendor = VENDORS.find((v) => v.id === SEQUENCE[sequence - 1])!;

  // 1. Validate config / recording BEFORE any side effects.
  const vmode = vendorMode();
  let to = "";
  if (mode === "live") {
    const need = ["DIAL_API_KEY"];
    if (vmode === "ai") need.push("DIAL_VENDOR_NUMBER_ID", "DIAL_VENDOR_PHONE", "DIAL_FROM_NUMBER_ID");
    else {
      if (!vendorPhone(vendor.id)) need.push(vendor.id === "certly" ? "CERTLY_PHONE" : "VANTLY_PHONE");
      if (!process.env.DIAL_FROM_NUMBER_ID && !process.env.DIAL_FROM_NUMBER) need.push("DIAL_FROM_NUMBER_ID");
    }
    const missing = need.filter((k) => !process.env[k]?.trim());
    if (missing.length > 0) return reply({ error: `Live mode (VENDOR_MODE=${vmode}) is not configured: set ${missing.join(", ")} in .env.local, or use mode=replay.` }, 400);
    to = vmode === "ai" ? process.env.DIAL_VENDOR_PHONE!.trim() : vendorPhone(vendor.id)!.trim();
    if (!E164.test(to)) return reply({ error: `Vendor phone number is not E.164 (e.g. +14155550123): "${to}"` }, 400);
  }
  const recording = mode === "replay" ? pickRecording(vendor.id, sequence, new Set(calls.flatMap((c) => (c.dialCallId ? [c.dialCallId] : [])))) : null;
  if (mode === "replay" && !recording) return reply({ error: `No recorded call for ${vendor.name} yet` }, 404);

  // 2. Pool -> negotiating; member orders -> negotiating.
  let pool = recomputePool();
  if (pool.status === "settled") return reply({ error: "Pool is already settled; reset the demo to negotiate again." }, 409);
  const members = pool.memberOrderIds.map((id) => get("orders", id)).filter((o): o is Order => !!o);
  if (members.length === 0) return reply({ error: "No pooled orders yet; nothing to negotiate." }, 400);
  pool = put("pools", { ...pool, status: "negotiating" });
  const stamp = now().toISOString();
  const negotiating: Order[] = members.map((o) => (o.status === "held" || o.status === "pooled" ? put("orders", { ...o, status: "negotiating", poolId: pool.id, updatedAt: stamp }) : o));

  const callId = newId("call");
  const startedAt = new Date().toISOString(); // real time: this is a real call

  // 3a. Replay a recorded real call.
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
    return reply(call, 201);
  }

  // 3b. Live call.
  let evidence;
  try { evidence = await getDemandEvidence(pool.category); } catch { evidence = null; }
  evidence ??= { source: "unavailable" as const, queryText: "", ranAt: null, interestedBuyers90d: null, abandonedOverPrice90d: null, medianMaxPricePerSeatCents: null, isSyntheticHistory: true, summary: "Keewano unavailable." };
  const instruction = buildInstruction({ vendor, pool, members: negotiating, evidence, priorQuotes: all("quotes"), now: now() });
  const header =
    vmode === "ai"
      ? `[want-it note] vendor_mode=ai: a Dial AI agent answered as ${vendor.name} (test vendor persona applied to the vendor number). Round ${sequence}.`
      : `[want-it note] vendor_mode=human: a teammate answered as ${vendor.name} (test vendor). Round ${sequence}.`;

  const base: Call = { id: callId, poolId: pool.id, vendorId: vendor.id, sequence, dialCallId: null, status: "queued", source: "live", recordedAt: null, instruction: `${header}\n\n${instruction}`, transcriptTurns: [], error: null, startedAt, endedAt: null };
  const failed = (error: string) => put("calls", { ...base, status: "failed", error, endedAt: new Date().toISOString() });

  if (vmode === "ai") {
    const persona = personaFor(vendor.id);
    if (!persona) return reply({ call: failed(`No vendor persona defined for ${vendor.name}`), error: `No vendor persona defined for ${vendor.name}` }, 500);
    const patched = await updateNumber(process.env.DIAL_VENDOR_NUMBER_ID!.trim(), { inboundInstruction: persona.instruction() });
    if (!patched.ok) {
      const msg = `Could not set the ${vendor.name} persona on the vendor number: ${patched.error}. No call was placed.`;
      return reply({ error: msg, call: failed(msg) }, 502);
    }
  }

  const created = await createCall({ to, instruction, idempotencyKey: callId });
  if (!created.ok) {
    const msg = `Dial could not place the call: ${created.error}`;
    return reply({ error: msg, call: failed(msg) }, 502);
  }
  const call = put("calls", { ...base, dialCallId: created.data.dialCallId, status: created.data.status === "failed" ? "failed" : "queued", error: created.data.error });
  return reply(call, 201);
}
