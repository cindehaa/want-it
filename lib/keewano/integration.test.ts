import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDemandEvidence, recordEvent } from "./index";

let directory: string;
const originalDirectory = process.cwd();
before(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "want-it-keewano-test-")); process.chdir(directory); });
after(async () => { process.chdir(originalDirectory); await rm(directory, { recursive: true, force: true }); });

function mockServer(t: { mock: { method: typeof import("node:test").mock.method } }) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    const body = JSON.parse(options.body as string);
    calls.push(body);
    let result: unknown;
    switch (body.method) {
      case "initialize": result = { protocolVersion: "2025-03-26" }; break;
      case "notifications/initialized": return new Response(null, { status: 202 });
      case "tools/list": result = { tools: [{ name: "execute_sql", inputSchema: { properties: { sql: { type: "string" } }, required: ["sql"] } }] }; break;
      case "tools/call": {
        const sql = (body.params.arguments as { sql: string }).sql;
        const row = sql.includes("percentile_cont") ? { median_max_price: 2210 } : { interested_buyers: 60, abandoned_buyers: 21, synthetic_buyers: 60 };
        result = { content: [{ type: "text", text: JSON.stringify({ rows: [row] }) }] };
        break;
      }
      default: throw new Error("Unexpected method");
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "test-session" } });
  });
  return calls;
}

test("live MCP query is deduplicated in flight and cached with its original timestamp", async (t) => {
  process.env.KEEWANO_PAT = "test-cache-token";
  const calls = mockServer(t);
  const [first, second] = await Promise.all([getDemandEvidence("soc2_compliance"), getDemandEvidence("soc2_compliance")]);
  assert.deepEqual(first, second);
  assert.equal(first.source, "keewano_live");
  assert.equal(calls.filter((c) => c.method === "tools/call").length, 2);
  assert.equal(first.interestedBuyers90d, 60);
  assert.ok(first.queryText.includes("count(DISTINCT user_id)"));
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  const fallback = await getDemandEvidence("soc2_compliance");
  assert.equal(fallback.source, "keewano_cached");
  assert.equal(fallback.ranAt, first.ranAt);
  assert.equal(fallback.interestedBuyers90d, first.interestedBuyers90d);
  assert.match(fallback.summary, /HTTP 503/);
  assert.equal((await getDemandEvidence("dev_tools")).source, "unavailable");
  process.env.KEEWANO_PAT = "different-account";
  assert.equal((await getDemandEvidence("soc2_compliance")).source, "unavailable");
});

test("non-JSON or erroneous tool data cannot become live evidence", async (t) => {
  process.env.KEEWANO_PAT = "malformed-token";
  t.mock.method(globalThis, "fetch", async () => new Response("not json", { headers: { "Content-Type": "application/json" } }));
  const evidence = await getDemandEvidence("soc2_compliance");
  assert.equal(evidence.source, "unavailable");
  assert.equal(evidence.interestedBuyers90d, null);
});

test("ingestion registers its schema before sending typed order events", async (t) => {
  process.env.KEEWANO_EVENT_KEY = "test-ingest-key";
  const sent: { url: string; body: { events?: unknown[]; eventTypes?: unknown[] } }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    sent.push({ url, body });
    return new Response(JSON.stringify(url.endsWith("/custom") ? { status: "registered" } : { received: body.events.length, accepted: body.events.length }), { headers: { "Content-Type": "application/json" } });
  });
  await recordEvent({ type: "order_placed", orderId: "test-order", category: "soc2_compliance", seats: 5, at: "2026-10-11T21:00:00Z" });
  assert.equal(sent.length, 2);
  assert.ok(sent[0].url.endsWith("/custom"));
  assert.equal(sent[0].body.eventTypes?.length, 10);
  assert.equal(sent[1].body.events?.length, 4);
});

test("a hanging query stops at the eight-second deadline", async (t) => {
  process.env.KEEWANO_PAT = "timeout-token";
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    // Keep the test process alive while the unref'ed AbortSignal timeout runs.
    const keepAlive = setTimeout(() => {}, 9000);
    options.signal?.addEventListener("abort", () => clearTimeout(keepAlive), { once: true });
  }));
  const start = Date.now();
  const evidence = await getDemandEvidence("soc2_compliance");
  assert.equal(evidence.source, "unavailable");
  assert.match(evidence.summary, /8-second/);
  assert.ok(Date.now() - start < 9000);
});

test("the ingest boundary strips extra local metadata from API events", async (t) => {
  const { demandBatch } = await import("./events");
  const { sendBatch } = await import("./ingest");
  const original = demandBatch({ type: "order_placed", orderId: "metadata-order", category: "soc2_compliance", seats: 2, at: "2026-10-11T21:00:00Z" });
  const withMetadata = { ...original, events: original.events.map((e) => ({ ...e, name: "local name", debugLabel: "local only" })) };
  const bodies: { events?: Record<string, unknown>[] }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    bodies.push(body);
    return new Response(JSON.stringify(url.endsWith("/custom") ? { status: "registered" } : { received: body.events.length, accepted: body.events.length }), { headers: { "Content-Type": "application/json" } });
  });
  await sendBatch(withMetadata, "metadata-test-key", AbortSignal.timeout(8000));
  assert.deepEqual(Object.keys(bodies[1].events![0]).sort(), ["data", "dataType", "eventTypeId", "timestamp"]);
});
