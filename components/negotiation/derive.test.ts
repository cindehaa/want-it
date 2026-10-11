import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixture } from "@/components/pool/fixture";
import { buildLanes, ratchetSeries } from "./derive";
import { effectiveAllIn } from "@/lib/dial/prompt";
import { VENDORS } from "@/lib/vendors";

test("the leaderboard and call prompt reject a tier unsupported after price caps", () => {
  const view = buildFixture("quoted");
  const ids = new Set(view.pool.memberOrderIds);
  const members = view.orders.filter((o) => ids.has(o.id));
  const quote = { ...view.quotes[0], tiers: [{ minSeats: view.pool.totalSeats, pricePerSeatCents: 2100 }], expiresAt: null };
  view.quotes = [quote];
  assert.ok(members.some((o) => (o.maxPricePerSeatCents ?? 3000) < 2100));
  assert.equal(effectiveAllIn(quote, members, new Date(view.now)), null);
  assert.equal(buildLanes(view, null).find((l) => l.vendor.id === quote.vendorId)?.eligible, false);
});

test("expired quotes do not appear as the negotiation room's best offer", () => {
  const view = buildFixture("quoted");
  view.quotes = view.quotes.map((q) => ({ ...q, expiresAt: "2000-01-01T00:00:00Z" }));
  assert.ok(buildLanes(view, null).every((l) => !l.eligible));
});

test("the chart uses the same reference list price as checkout after adding vendors", () => {
  const view = buildFixture("open");
  view.vendors = VENDORS;
  assert.equal(ratchetSeries(buildLanes(view, null)).lowestList, 3000);
});
