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
    if (opts.method === "POST") {
      started.push(Date.now());
      return json({ call: { id: `dial_${started.length}`, status: { state: "Queued" } } });
    }
    return json({ call: { id: String(_url).split("/").at(-1), status: { state: "Terminated", terminationType: "completed" }, recordingAvailable: true, duration: 1 } });
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
  const refresh = await import("@/lib/dial/refresh");
  const finished = await Promise.all(calls.map((call) => refresh.refreshCall(call.id, { force: true })));
  assert.ok(finished.every((r) => r.call?.audio.recordingUrl === `/api/calls/${r.call.id}/audio`));
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


test("recording proxy forwards authentication and byte ranges without exposing the key", async (t) => {
  const stamp = new Date().toISOString();
  const contracts = await import("@/lib/contracts");
  store.put("calls", contracts.Call.parse({ id: "call_proxy", poolId: "pool_soc2", vendorId: "certly", sequence: 1, dialCallId: "dial_proxy", status: "ended", source: "live", recordedAt: null, instruction: "test", transcriptTurns: [], error: null, startedAt: stamp, endedAt: stamp }));
  const bytes = new Uint8Array(44);
  bytes.set(new TextEncoder().encode("RIFF"));
  t.mock.method(globalThis, "fetch", async (url: string, opts: RequestInit) => {
    assert.ok(String(url).startsWith("https://"));
    assert.ok(String(url).endsWith("/calls/dial_proxy/recording"));
    const headers = new Headers(opts.headers);
    assert.equal(headers.get("Authorization"), "Bearer backend-test-key");
    assert.equal(headers.get("Range"), "bytes=0-43");
    return new Response(bytes, { status: 206, headers: { "Content-Type": "binary/octet-stream", "Content-Range": "bytes 0-43/44", "Content-Length": "44" } });
  });
  const route = await import("@/app/api/calls/[id]/audio/route");
  const result = await route.GET(new Request("http://localhost/api/calls/call_proxy/audio", { headers: { Range: "bytes=0-43" } }), { params: Promise.resolve({ id: "call_proxy" }) });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get("Content-Type"), "audio/wav");
  assert.equal(result.headers.get("Content-Range"), "bytes 0-43/44");
  assert.ok(![...result.headers.values()].join(" ").includes("backend-test-key"));
  assert.equal((await result.arrayBuffer()).byteLength, 44);
});

test("the saved library exposes all five playable calls without creating order or call rows", async () => {
  const before = store.all("calls");
  const route = await import("@/app/api/recordings/route");
  const result = await route.GET().json();
  assert.equal(result.calls.length, 5);
  assert.ok(result.calls.every((call: import("@/lib/contracts").Call) => call.audio.recordingUrl?.startsWith("/recordings/") && call.audio.liveUrl === null));
  assert.deepEqual(store.all("calls"), before);
});
