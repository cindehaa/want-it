import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Call, Order, Quote } from "./contracts";

let directory: string;
let store: typeof import("./db");
let seed: typeof import("./seed");
let clock: typeof import("./clock");
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "want-it-purchase-test-"));
  process.env.DB_PATH = path.join(directory, "test.db");
  process.env.KEEWANO_EVENT_KEY = "";
  process.env.KEEWANO_PAT = "";
  store = await import("./db");
  seed = await import("./seed");
  clock = await import("./clock");
});
beforeEach(() => seed.seedDemo());
after(async () => { store.db().close(); await rm(directory, { recursive: true, force: true }); });

async function create(over: Record<string, unknown> = {}) {
  const route = await import("@/app/api/orders/route");
  return route.POST(new Request("http://localhost/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), buyerName: "Flow Test", category: "soc2_compliance", seats: 5, maxPricePerSeatCents: 2400, preferredVendorId: null, ...over }) }));
}
async function settle() {
  return (await import("@/app/api/pool/settle/route")).POST();
}

test("buyer cancellation releases the hold in the stored order", async () => {
  const order: Order = await (await create()).json();
  const route = await import("@/app/api/orders/[id]/cancel/route");
  const res = await route.POST(new Request("http://localhost/cancel", { method: "POST" }), { params: Promise.resolve({ id: order.id }) });
  assert.equal(res.status, 200);
  assert.equal(store.get("orders", order.id)?.holdAmountCents, 0);
});

test("checkout rejects whitespace names and invalid deadline dates", async () => {
  assert.equal((await create({ buyerName: "   " })).status, 400);
  assert.equal((await create({ deadline: "not-a-date" })).status, 400);
});

test("new orders cannot be stranded in a settled or closed pool", async () => {
  const first: Order = await (await create()).json();
  await settle();
  assert.equal((await create()).status, 409);
  assert.equal((await create({ idempotencyKey: first.idempotencyKey })).status, 200);
  seed.seedDemo();
  clock.advanceClock(73);
  assert.equal((await create()).status, 409);
});

test("settlement and reset refuse to discard an active call", async () => {
  const call: Call = { id: "call_active", poolId: "pool_soc2", vendorId: "certly", sequence: 1, dialCallId: null, status: "queued", source: "live", recordedAt: null, instruction: "test", transcriptTurns: [], error: null, startedAt: new Date().toISOString(), endedAt: null };
  store.put("calls", call);
  assert.equal((await settle()).status, 409);
  assert.equal(store.get("pools", "pool_soc2")?.status, "open");
  assert.equal((await (await import("@/app/api/demo/reset/route")).POST()).status, 409);
  assert.ok(store.get("calls", call.id));
});

test("settlement refuses an auto-run between vendor calls", async () => {
  store.kvSet("negotiateRun", JSON.stringify({ running: true, mode: "replay", order: ["certly"], startedAt: new Date().toISOString(), finishedAt: null, error: null, extractionRetried: [] }));
  assert.equal((await settle()).status, 409);
});

test("stopping during an asynchronous runner tick prevents the next call", async () => {
  const runner = await import("@/lib/dial/runner");
  const pending = runner.startRun("replay");
  runner.stopRun();
  await pending;
  const calls = store.all("calls");
  // Drain extraction in the broken implementation before the temporary DB is removed.
  for (const call of calls) await (await import("@/lib/dial/refresh")).refreshCall(call.id);
  assert.equal(calls.length, 0);
  assert.equal(runner.runView().running, false);
});

test("parallel calls are not dialed after stopping during persona setup", async (t) => {
  const runner = await import("@/lib/dial/runner");
  const key = process.env.DIAL_API_KEY;
  const lanes = process.env.DIAL_PARALLEL_LANES;
  process.env.DIAL_API_KEY = "test-key";
  process.env.DIAL_PARALLEL_LANES = JSON.stringify(["certly", "vantly"].map((vendorId, i) => ({ vendorId, vendorNumberId: `vendor-${i}`, callerNumberId: `caller-${i}`, vendorPhone: `+1415555010${i}` })));
  t.after(() => {
    if (key === undefined) delete process.env.DIAL_API_KEY; else process.env.DIAL_API_KEY = key;
    if (lanes === undefined) delete process.env.DIAL_PARALLEL_LANES; else process.env.DIAL_PARALLEL_LANES = lanes;
  });
  let announce!: () => void;
  let release!: () => void;
  const started = new Promise<void>((r) => { announce = r; });
  const gate = new Promise<void>((r) => { release = r; });
  let dialed = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, opts: RequestInit) => {
    if (opts.method === "PATCH") { announce(); await gate; }
    else dialed++;
    return new Response(JSON.stringify({ id: "test-call", status: "Queued" }), { headers: { "content-type": "application/json" } });
  });
  const pending = runner.startRun("live", { parallel: true });
  await started;
  runner.stopRun();
  release();
  await pending;
  assert.equal(dialed, 0);
  assert.equal(runner.runView().running, false);
});

test("order preview ignores unconfirmed and expired quotes", async () => {
  const order: Order = await (await create()).json();
  const stamp = new Date().toISOString();
  const call: Call = { id: "call_fixture", poolId: "pool_soc2", vendorId: "certly", sequence: 1, dialCallId: null, status: "extracted", source: "recorded_replay", recordedAt: stamp, instruction: "test", transcriptTurns: [], error: null, startedAt: stamp, endedAt: stamp };
  store.put("calls", call);
  const quote: Quote = { id: "quote_fixture", callId: call.id, vendorId: "certly", tiers: [{ minSeats: 1, pricePerSeatCents: 2100 }], perAccountFeeCents: 0, separateAccountsConfirmed: null, expiresAt: null, conditions: [], evidence: "fixture", status: "supplier_stated", createdAt: stamp };
  const route = await import("@/app/api/orders/[id]/route");
  async function preview() { return (await route.GET(new Request("http://localhost/order"), { params: Promise.resolve({ id: order.id }) })).json(); }
  store.put("quotes", quote);
  assert.equal((await preview()).quotes.bestPricePerSeatCents, null);
  store.put("quotes", { ...quote, separateAccountsConfirmed: true, expiresAt: "2000-01-01T00:00:00Z" });
  assert.equal((await preview()).quotes.bestPricePerSeatCents, null);
});
