import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Call, Quote, type Order, type PoolView } from "@/lib/contracts";
import type { RunView } from "@/lib/dial/runner";

const base = process.env.BASE_URL ?? "http://localhost:3103";
const target = new URL(base);
const output = process.env.VERIFY_OUTPUT ?? path.join(os.tmpdir(), "want-it-certly-verification");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port && target.port !== "3000", "Use a separate local test server, never the demo server on port 3000.");
assert.ok([os.tmpdir(), "/tmp"].some((root) => process.env.DB_PATH?.startsWith(root + path.sep)), "Start the test server with the same temporary DB_PATH supplied to this command.");

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(base + route, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(65_000) });
  const json = await res.json();
  assert.ok(res.ok, `${method} ${route}: HTTP ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

async function main() {
  await mkdir(output, { recursive: true });
  const initial = await api<PoolView>("POST", "/api/demo/reset", {});
  assert.equal(initial.pool.totalSeats, 96);
  const buyer = await api<Order>("POST", "/api/orders", { idempotencyKey: crypto.randomUUID(), buyerName: "Certly verification buyer", category: "soc2_compliance", seats: 10, maxPricePerSeatCents: 2400, preferredVendorId: null });
  assert.equal(buyer.holdAmountCents, 24000);

  const started = await api<Call>("POST", "/api/pool/negotiate", { mode: "replay", vendorId: "certly" });
  const extracted = await api<{ call: Call; quote: Quote | null }>("GET", `/api/calls/${started.id}`);
  assert.equal(extracted.call.status, "extracted", extracted.call.error ?? "Extraction must complete.");
  const run = await api<RunView>("GET", "/api/pool/negotiate-all");
  assert.equal(run.running, false, "Replay run must finish without placing any live calls.");
  assert.equal(run.run?.error ?? null, null);
  assert.equal(run.progress.vendors.find((v) => v.vendorId === "certly")?.state, "done");
  const view = await api<PoolView>("GET", "/api/pool");
  assert.equal(view.calls.length, 1, "This check only replays Certly. Keep AUTO_NEGOTIATE=off on the test server.");
  const call = Call.parse(view.calls.find((c) => c.vendorId === "certly"));
  const quote = Quote.parse(view.quotes.find((q) => q.callId === call.id));
  assert.equal(call.source, "recorded_replay");
  assert.equal(call.status, "extracted");
  assert.equal(quote.separateAccountsConfirmed, true);
  assert.equal(quote.perAccountFeeCents, 0);
  assert.ok(quote.tiers.every((t) => t.pricePerSeatCents === 2100), "Use Certly's final year-one price, not the buyer's request or renewal price.");
  assert.ok(Math.abs(Date.parse(quote.expiresAt!) - Date.parse(call.recordedAt!) - 7 * 86400000) < 1000, "Seven-day expiry must start at the original call date.");
  assert.ok(quote.evidence.length > 0);
  for (const vendor of run.progress.vendors.filter((v) => v.state === "no_recording")) {
    assert.ok(!view.calls.some((c) => c.vendorId === vendor.vendorId), "Missing recordings cannot become fabricated calls.");
  }

  const settled = await api<PoolView>("POST", "/api/pool/settle", {});
  assert.equal(settled.pool.status, "settled");
  const deals = settled.orders.filter((o) => o.status === "deal_applied");
  const seats = deals.filter((o) => o.redemptionLink?.includes("/certly/")).reduce((sum, o) => sum + o.seats, 0);
  assert.ok(seats >= Math.min(...quote.tiers.map((t) => t.minSeats)), "Final paying seats must meet the quoted minimum.");
  const placed = settled.orders.find((o) => o.id === buyer.id)!;
  assert.equal(placed.finalPricePerSeatCents, 2100);
  assert.equal(placed.status, "deal_applied");
  assert.ok(placed.redemptionLink?.startsWith("https://example.test/redeem/certly/"));
  for (const order of settled.orders.filter((o) => o.status === "canceled_over_max")) {
    assert.equal(order.holdAmountCents, 0);
    assert.equal(order.finalPricePerSeatCents, null);
  }
  assert.ok(settled.timeSaved.agentCallMinutes >= 0);
  const again = await api<PoolView>("POST", "/api/pool/settle", {});
  assert.deepEqual(again.orders, settled.orders, "Repeated settlement must not change final orders.");
  const detail = await api<{ order: Order; dealVendorId: string }>("GET", `/api/orders/${buyer.id}`);
  assert.equal(detail.order.finalPricePerSeatCents, 2100);
  assert.equal(detail.dealVendorId, "certly");
  await writeFile(path.join(output, "receipt.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), base, run, call, quote, settled, buyerId: buyer.id }, null, 2));
  console.log(`Verified real Certly transcript -> extraction -> ${deals.length} deals, ${seats} Certly seats, $21/seat. Receipt: ${path.join(output, "receipt.json")}`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
