import assert from "node:assert/strict";
import { test } from "node:test";
import { demandBatch, syntheticBatches } from "./events";
import { evidenceFromRows } from "./evidence";
import { sqlTool } from "./mcp";

test("live order context and typed payload share a stable buyer and idempotent batch", () => {
  const input = { type: "order_placed" as const, orderId: "order-a", category: "soc2_compliance" as const, seats: 12, at: "2026-10-11T20:00:00Z" };
  const first = demandBatch(input);
  assert.deepEqual(first, demandBatch(input));
  assert.match(first.installId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
  assert.equal(first.events[0].data, "soc2_compliance");
  assert.equal(first.events[1].data, false);
  assert.equal(first.events.at(-1)?.data, 12);
  assert.equal(first.installId, demandBatch({ ...input, type: "order_canceled" }).installId);
  assert.notEqual(first.dataSessionId, demandBatch({ ...input, type: "order_canceled" }).dataSessionId);
  assert.throws(() => demandBatch({ ...input, seats: -1 }), /Invalid numeric event/);
  assert.throws(() => demandBatch({ ...input, at: "invalid" }), /Invalid event timestamp/);
});

test("synthetic history has 60 unique startups and exactly 35 percent price abandonment", () => {
  const anchor = 1791750000;
  const batches = syntheticBatches(anchor);
  assert.equal(new Set(batches.map((b) => b.installId)).size, 60);
  assert.equal(batches.filter((b) => b.events.some((e) => e.eventTypeId === 24004)).length, 21);
  for (const batch of batches) {
    assert.equal(batch.events.find((e) => e.eventTypeId === 24001)?.data, true);
    assert.ok(batch.events[0].timestamp > anchor - 90 * 86400);
    assert.ok(batch.events.at(-1)!.timestamp < anchor);
    assert.deepEqual(batch.events.map((e) => e.timestamp), batch.events.map((e) => e.timestamp).sort((a, b) => a - b));
  }
  assert.deepEqual(batches.map((b) => b.dataSessionId), syntheticBatches(anchor + 100).map((b) => b.dataSessionId));
});

test("SQL results validate counts and preserve zero and nullable medians", () => {
  const evidence = evidenceFromRows({ rows: [{ interested_buyers: "60", abandoned_buyers: "21", synthetic_buyers: "60" }] }, { rows: [{ median_max_price: "2210.5" }] }, "actual SQL", "2026-10-11T20:00:00Z");
  assert.equal(evidence.source, "keewano_live");
  assert.equal(evidence.medianMaxPricePerSeatCents, 2211);
  assert.equal(evidence.isSyntheticHistory, true);
  assert.equal(evidence.queryText, "actual SQL");
  assert.equal(evidenceFromRows({ interested_buyers: 0, abandoned_buyers: 0, synthetic_buyers: 0 }, { median_max_price: null }, "SQL", "date").medianMaxPricePerSeatCents, null);
  assert.throws(() => evidenceFromRows({ interested_buyers: 2, abandoned_buyers: 3, synthetic_buyers: 0 }, { median_max_price: null }, "SQL", "date"));
  assert.throws(() => evidenceFromRows({ interested_buyers: "made up", abandoned_buyers: 0, synthetic_buyers: 0 }, { median_max_price: null }, "SQL", "date"));
});

test("tool discovery uses the actual schema and never guesses a required project", () => {
  const tools = [{ name: "execute_sql", inputSchema: { properties: { sql: { type: "string" }, projectId: { type: "string" } }, required: ["sql", "projectId"] } }];
  assert.throws(() => sqlTool(tools), /requires projectId/);
  assert.deepEqual(sqlTool(tools, "project-a").args("SELECT 1"), { projectId: "project-a", sql: "SELECT 1" });
  assert.throws(() => sqlTool([...tools, { ...tools[0], name: "second_sql" }], "project-a"), /ambiguous/);
});
