import assert from "node:assert/strict";
import { test } from "node:test";
import { Call } from "@/lib/contracts";
import { extractQuote } from "./extract";
import { computeTimeSaved } from "@/lib/timeSaved";

const recordedAt = "2026-10-11T22:03:25.569Z";
const replayAt = new Date("2026-10-15T22:00:00Z");
const call = Call.parse({ id: "call_test", poolId: "pool_soc2", vendorId: "certly", sequence: 1, dialCallId: "test", status: "transcribed", source: "recorded_replay", recordedAt, instruction: "recorded fixture", transcriptTurns: [{ speaker: "agent", text: "Can you quote the group?", startMs: 0 }, { speaker: "user", text: "Twenty one dollars per seat for 96 seats. Separate accounts. No fees. Seven days.", startMs: 167186 }], error: null, startedAt: replayAt.toISOString(), endedAt: recordedAt });

test("replaying a call preserves the supplier's original seven-day expiry", async (t) => {
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  t.after(() => { if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, opts: RequestInit) => {
    const body = JSON.parse(opts.body as string);
    assert.match(body.messages[0].content, /2026-10-11T22:03:25.569Z/);
    const terms = { vendorStatedPrice: true, tiers: [{ minSeats: 96, pricePerSeatDollars: 21 }], perAccountFeeDollars: 0, separateAccountsConfirmed: true, expiresInDays: 7, expiresOnDate: null, conditions: [], evidence: [call.transcriptTurns[1].text] };
    return new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(terms) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }), { headers: { "content-type": "application/json" } });
  });
  const quote = await extractQuote(call, { now: replayAt });
  assert.equal(quote?.expiresAt, "2026-10-18T22:03:25.569Z");
  assert.equal(quote?.createdAt, replayAt.toISOString());
});

test("recorded call duration uses transcript timing instead of replay wall-clock subtraction", () => {
  const saved = computeTimeSaved([], [call]);
  assert.equal(saved.agentCallMinutes, 3);
});

test("extraction stores a supplier's per-company minimum separately from pooled volume", async (t) => {
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  t.after(() => { if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key; });
  const evidence = "Twenty one dollars per seat. Each company must buy ten or more seats. Separate accounts. No fees. Seven days.";
  const vendorCall = { ...call, vendorId: "vantly", transcriptTurns: [call.transcriptTurns[0], { ...call.transcriptTurns[1], text: evidence }] };
  t.mock.method(globalThis, "fetch", async (_url: unknown, opts: RequestInit) => {
    const body = JSON.parse(opts.body as string);
    const terms = { vendorStatedPrice: true, tiers: [{ minSeats: 1, pricePerSeatDollars: 21 }], minSeatsPerAccount: 10, perAccountFeeDollars: 0, separateAccountsConfirmed: true, expiresInDays: 7, expiresOnDate: null, conditions: ["Each company must buy ten or more seats"], evidence: [evidence] };
    return new Response(JSON.stringify({ id: "msg_minimum", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(terms) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }), { headers: { "content-type": "application/json" } });
  });
  const quote = await extractQuote(vendorCall, { now: replayAt });
  assert.equal((quote as unknown as { minSeatsPerAccount?: number })?.minSeatsPerAccount, 10);
  assert.equal(quote?.tiers[0].minSeats, 1);
});
