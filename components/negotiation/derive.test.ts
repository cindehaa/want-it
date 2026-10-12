import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixture } from "@/components/pool/fixture";
import { buildLanes, parseRun, ratchetSeries } from "./derive";
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

test("stopping a replay run does not invent missing recordings for uncalled vendors", () => {
  const view = buildFixture("open");
  const run = parseRun({ run: { running: false, mode: "replay", order: ["certly"], finishedAt: view.now, error: "Stopped by user" }, progress: { vendors: [{ vendorId: "certly", state: "pending" }] } });
  assert.equal(buildLanes(view, run)[0].status, "waiting");
});

test("the empty hosted room exposes all five completed recordings without inventing quotes", async () => {
  const { withSavedRecordings } = await import("./recordings");
  const { recordedPlayback } = await import("@/lib/dial/playback");
  const recordings = (await import("@/data/recorded-calls.json")).default;
  const view = buildFixture("open");
  view.vendors = VENDORS;
  view.calls = [];
  view.quotes = [];
  const result = withSavedRecordings(view, { calls: recordedPlayback(recordings) });
  const lanes = buildLanes(result, null);
  assert.equal(result.calls.length, 5);
  assert.ok(lanes.every((lane) => lane.call?.audio.recordingUrl && lane.status === "extracted"));
  assert.ok(lanes.every((lane) => !lane.eligible));
  assert.equal(result.quotes.length, 0);
  assert.equal(view.calls.length, 0);
});

test("a current vendor call takes priority over its saved recording", async () => {
  const { withSavedRecordings } = await import("./recordings");
  const { recordedPlayback } = await import("@/lib/dial/playback");
  const recordings = (await import("@/data/recorded-calls.json")).default;
  const view = buildFixture("quoted");
  view.vendors = VENDORS;
  const current = view.calls[0];
  current.status = "in_progress";
  view.calls = [current];
  const result = withSavedRecordings(view, { calls: recordedPlayback(recordings) });
  assert.equal(result.calls.find((call) => call.vendorId === current.vendorId), current);
  assert.equal(result.calls.filter((call) => call.vendorId === current.vendorId).length, 1);
  assert.equal(result.quotes, view.quotes);
});


test("saved supplier quotes attach to their recording and preserve current quotes", async () => {
  const { withSavedRecordings } = await import("./recordings");
  const { recordedPlayback } = await import("@/lib/dial/playback");
  const recordings = (await import("@/data/recorded-calls.json")).default;
  const quotes = (await import("@/data/recorded-quotes.json")).default;
  const view = buildFixture("open");
  view.vendors = VENDORS;
  view.calls = [];
  view.quotes = [];
  const result = withSavedRecordings(view, { calls: recordedPlayback(recordings), quotes });
  assert.equal(result.quotes.length, 5);
  assert.equal(view.quotes.length, 0);
  assert.ok(result.quotes.every((quote) => result.calls.some((call) => call.id === quote.callId && call.vendorId === quote.vendorId)));
  const lanes = buildLanes(result, null);
  for (const [vendor, cents] of [["certly", 2200], ["vantly", 2100], ["trustwise", 2400], ["auditly", 1600], ["complykit", 2100]] as const) {
    assert.equal(lanes.find((lane) => lane.vendor.id === vendor)?.quotedTier?.pricePerSeatCents, cents);
  }
  const current = result.calls.find((call) => call.vendorId === "certly")!;
  const currentQuote = { ...result.quotes.find((quote) => quote.vendorId === "certly")!, id: "current_quote", callId: "current_call" };
  view.calls = [{ ...current, id: "current_call", source: "live", status: "extracted" }];
  view.quotes = [currentQuote];
  const mixed = withSavedRecordings(view, { calls: recordedPlayback(recordings), quotes });
  assert.equal(mixed.quotes.find((quote) => quote.vendorId === "certly"), currentQuote);
  assert.equal(mixed.quotes.filter((quote) => quote.vendorId === "certly").length, 1);
});
