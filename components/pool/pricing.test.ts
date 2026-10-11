import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixture } from "./fixture";
import { bestGroupPrice, yourPrice } from "./pricing";
import { bestGroupCents } from "@/components/store/usePoolPrice";

test("store and map prices reject expired offers", () => {
  const view = buildFixture("quoted");
  view.quotes = view.quotes.map((q) => ({ ...q, expiresAt: "2000-01-01T00:00:00Z" }));
  assert.equal(bestGroupPrice(view), null);
  assert.equal(yourPrice(view, 10), null);
  assert.equal(bestGroupCents(view), null);
});

test("store and map prices reject unsupported volume after price caps", () => {
  const view = buildFixture("quoted");
  view.quotes = [{ ...view.quotes[0], expiresAt: null, tiers: [{ minSeats: view.pool.totalSeats, pricePerSeatCents: 2100 }] }];
  assert.equal(bestGroupPrice(view), null);
  assert.equal(yourPrice(view, 10), null);
  assert.equal(bestGroupCents(view), null);
});
