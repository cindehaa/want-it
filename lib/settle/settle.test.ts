import assert from "node:assert/strict";
import { test } from "node:test";
import { Order, Quote } from "@/lib/contracts";
import { settleOrders } from "./index";

const at = new Date("2026-10-11T22:00:00Z");
function order(id: string, seats: number, max: number | null = null, preferred: string | null = null) {
  return Order.parse({ id, idempotencyKey: id, buyerName: id, isSimulated: true, category: "soc2_compliance", seats, maxPricePerSeatCents: max, preferredVendorId: preferred, lat: 0, lng: 0, city: "test", deadline: "2026-11-01T00:00:00Z", holdAmountCents: 0, status: "negotiating", finalPricePerSeatCents: null, redemptionLink: null, poolId: "pool_soc2", createdAt: at.toISOString(), updatedAt: at.toISOString() });
}
function quote(vendorId: string, tiers: Quote["tiers"], expiresAt: string | null = null) {
  return Quote.parse({ id: vendorId, callId: vendorId, vendorId, tiers, perAccountFeeCents: 0, separateAccountsConfirmed: true, expiresAt, conditions: [], evidence: "fixture terms", status: "supplier_stated", createdAt: at.toISOString() });
}

test("Certly's 96-seat offer cannot apply after eight unaffordable seats drop out", () => {
  const members = [order("affordable", 88, 2400), order("over-max", 8, 2000)];
  const q = quote("certly", [{ minSeats: 96, pricePerSeatCents: 2100 }]);
  const result = settleOrders(members, [q]);
  assert.equal(result.filter((r) => r.status === "deal_applied").length, 0);
  assert.ok(result.every((r) => r.status === "canceled_over_max"));
});

test("a lower eligible tier survives after over-max buyers leave", () => {
  const members = [order("affordable", 60, 2600), order("over-max", 40, 2000)];
  const q = quote("certly", [{ minSeats: 50, pricePerSeatCents: 2500 }, { minSeats: 100, pricePerSeatCents: 2100 }]);
  const result = settleOrders(members, [q]);
  assert.equal(result[0].pricePerSeatCents, 2500);
  assert.equal(result[1].status, "canceled_over_max");
});

test("competing vendors cannot both count the same seats toward their volume tier", () => {
  const members = [order("certly-only", 10, 2500, "certly"), order("open", 20, 2500)];
  const certly = quote("certly", [{ minSeats: 30, pricePerSeatCents: 2300 }]);
  const vantly = quote("vantly", [{ minSeats: 20, pricePerSeatCents: 2100 }]);
  const result = settleOrders(members, [certly, vantly]);
  assert.equal(result[0].status, "canceled_over_max");
  assert.equal(result[1].vendorId, "vantly");
});

test("expired quotes cannot become a deal", () => {
  const q = quote("certly", [{ minSeats: 1, pricePerSeatCents: 2100 }], "2000-01-01T00:00:00Z");
  assert.equal(settleOrders([order("buyer", 10)], [q])[0].status, "list_price");
});

test("a company's seat minimum cannot be satisfied by pooling smaller accounts", () => {
  const q = { ...quote("vantly", [{ minSeats: 10, pricePerSeatCents: 2100 }]), minSeatsPerAccount: 10 };
  const result = settleOrders([order("six", 6), order("nine", 9), order("ten", 10)], [q], at);
  assert.equal(result[0].vendorId, null);
  assert.equal(result[1].vendorId, null);
  assert.equal(result[2].vendorId, "vantly");
});

test("the seeded pool cannot take ComplyKit until eight qualifying seats are added", async () => {
  const { bestEffectiveQuote, effectiveAllIn } = await import("@/lib/dial/prompt");
  const stored = (await import("@/data/recorded-quotes.json")).default;
  const quotes = Quote.array().parse(stored);
  const members = [order("a", 12, 2400), order("b", 6), order("c", 15, 2200), order("d", 4, 2600), order("e", 9), order("f", 3, 1800), order("g", 8, 2500), order("h", 10, null, "certly"), order("i", 7, 2300), order("j", 5, 2000), order("k", 11), order("l", 6, 2600)];
  assert.equal(bestEffectiveQuote(quotes, members, { now: at })?.vendorId, "trustwise");
  assert.equal(effectiveAllIn(quotes.find((q) => q.vendorId === "trustwise")!, members, at)?.seats, 56);
  assert.equal(effectiveAllIn(quotes.find((q) => q.vendorId === "complykit")!, members, at), null);
  const enlarged = [...members, order("eight-more", 8, 2400)];
  const winner = bestEffectiveQuote(quotes, enlarged, { now: at });
  assert.equal(winner?.vendorId, "complykit");
  assert.equal(winner?.allInPerSeatCents, 2100);
  assert.equal(winner?.seats, 86);
});
