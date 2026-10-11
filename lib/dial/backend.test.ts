import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NEGOTIATION_ORDER } from "@/lib/vendors";

let directory: string;
let store: typeof import("@/lib/db");
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "want-it-call-backend-"));
  process.env.DB_PATH = path.join(directory, "test.db");
  process.env.KEEWANO_PAT = "";
  process.env.KEEWANO_EVENT_KEY = "";
  process.env.DIAL_API_KEY = "backend-test-key";
  process.env.DIAL_PARALLEL_LANES = JSON.stringify(NEGOTIATION_ORDER.map((vendorId, i) => ({ vendorId, callerNumberId: `caller-${i}`, vendorNumberId: `vendor-${i}`, vendorPhone: `+1415555010${i}` })));
  store = await import("@/lib/db");
});
beforeEach(async () => { (await import("@/lib/seed")).seedDemo(); });
after(async () => { store.db().close(); await rm(directory, { recursive: true, force: true }); });

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

test("default live negotiate-all starts all five calls within two seconds", async (t) => {
  const started: number[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, opts: RequestInit) => {
    if (opts.method === "PATCH") { await new Promise((r) => setTimeout(r, 40)); return json({ number: { id: "number" } }); }
    started.push(Date.now());
    return json({ call: { id: `dial_${started.length}`, status: { state: "Queued" } } });
  });
  const route = await import("@/app/api/pool/negotiate-all/route");
  const start = Date.now();
  const response = await route.POST(new Request("http://localhost/api/pool/negotiate-all", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "live", round2: false }) }));
  assert.equal(response.status, 200);
  assert.equal(started.length, 5);
  assert.ok(Math.max(...started) - start < 2000);
  assert.ok(Math.max(...started) - Math.min(...started) < 250, "Calls must fan out together, not wait for each conversation to finish.");
  const calls = store.all("calls");
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls.map((c) => c.sequence)).size, 5);
  (await import("@/lib/dial/runner")).stopRun();
});

test("finished calls expose a safe recording URL and preserve the pool response", async (t) => {
  const stamp = new Date().toISOString();
  const id = "call_audio_test";
  const contracts = await import("@/lib/contracts");
  store.put("calls", contracts.Call.parse({ id, poolId: "pool_soc2", vendorId: "certly", sequence: 1, dialCallId: "dial_audio", status: "queued", source: "live", recordedAt: null, instruction: "test", transcriptTurns: [], error: null, startedAt: stamp, endedAt: null }));
  t.mock.method(globalThis, "fetch", async (url: string) => String(url).includes("/calls?") ? json({ calls: [] }) : json({ call: { id: "dial_audio", status: { state: "Terminated", terminationType: "completed" }, recordingAvailable: true, createdAt: stamp, duration: 1 } }));
  const result = await (await import("@/lib/dial/refresh")).refreshCall(id, { force: true });
  assert.equal(result.call?.audio.recordingUrl, `/api/calls/${id}/audio`);
  assert.equal(result.call?.audio.liveUrl, null);
  assert.equal(result.call?.audio.liveKind, null);
  assert.ok(!JSON.stringify(result.call?.audio).includes("backend-test-key"));
  const pool = await (await import("@/lib/poolView")).buildPoolView();
  for (const key of ["now", "clockOffsetHours", "demoMode", "pool", "orders", "vendors", "calls", "quotes", "evidence", "timeSaved"]) assert.ok(key in pool);
});
