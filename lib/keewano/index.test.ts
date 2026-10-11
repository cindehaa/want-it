import assert from "node:assert/strict";
import { test } from "node:test";
import { getDemandEvidence, recordEvent } from "./index";

test("unconfigured evidence explains missing credentials without invented counts", async () => {
  delete process.env.KEEWANO_PAT;
  const evidence = await getDemandEvidence("soc2_compliance");
  assert.equal(evidence.source, "unavailable");
  assert.equal(evidence.interestedBuyers90d, null);
  assert.match(evidence.summary, /KEEWANO_PAT/);
});

test("an invalid demand event never escapes to checkout", async () => {
  process.env.KEEWANO_EVENT_KEY = "test-key";
  await assert.doesNotReject(recordEvent({
    type: "order_placed", orderId: "test-order", category: "soc2_compliance",
    seats: -1, at: "not-a-date",
  }));
  delete process.env.KEEWANO_EVENT_KEY;
});
