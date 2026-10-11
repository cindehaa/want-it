// Local fixture for the negotiation room. Used ONLY when GET /api/pool fails (or with ?fixture=idle|running|done).
// Five fictional test vendors; every quote is supplier_stated. Nothing here is a real call.
import { buildFixture } from "@/components/pool/fixture";
import type { Call, PoolView, Quote, Vendor } from "@/lib/contracts";
import type { RunState } from "./derive";

export type NegotiationFixtureStage = "idle" | "running" | "done";

const VENDORS: Vendor[] = [
  { id: "certly", name: "Certly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3000 },
  { id: "vantly", name: "Vantly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3200 },
  { id: "trustwise", name: "Trustwise", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 2800 },
  { id: "auditly", name: "Auditly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3400 },
  { id: "complykit", name: "ComplyKit", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 2900 },
];

type Plan = {
  id: string;
  tiers: [number, number][]; // [minSeats, dollars]
  feeDollars: number;
  conditions: string[];
  said: string; // the vendor's final-terms line, also used as evidence
  cited: string | null; // what the agent cites about prior offers
};

const PLANS: Plan[] = [
  {
    id: "certly",
    tiers: [[50, 27], [100, 24], [200, 21]],
    feeDollars: 40,
    conditions: ["First-year pricing only", "Annual prepay"],
    said: "I can do $27 a seat from 50 seats, $24 from 100, and $21 from 200 seats. There's a $40 onboarding fee per account.",
    cited: null,
  },
  {
    id: "vantly",
    tiers: [[75, 26], [150, 23], [240, 19]],
    feeDollars: 0,
    conditions: ["First-year pricing only"],
    said: "Separate accounts, no per-account fee. Tiers are $26 from 75 seats, $23 from 150, and $19 from 240.",
    cited: "Another vendor is at about $22.93 a seat once its account fee is spread out.",
  },
  {
    id: "trustwise",
    tiers: [[100, 23], [200, 20]],
    feeDollars: 0,
    conditions: ["Annual prepay"],
    said: "$23 a seat from 100 seats and $20 from 200. No fee per account, and every company gets its own workspace.",
    cited: "The best offer in hand is $19 a seat.",
  },
  {
    id: "auditly",
    tiers: [[50, 26], [150, 21], [240, 17.5]],
    feeDollars: 25,
    conditions: ["First-year pricing only", "Quote valid 5 days"],
    said: "For 240 seats and up it's $17.50 a seat. Tiers are $26 from 50 and $21 from 150, plus a one-time $25 per account.",
    cited: "The best offer in hand is $19 a seat. Can you beat it?",
  },
  {
    id: "complykit",
    tiers: [[50, 25], [200, 19.5]],
    feeDollars: 0,
    conditions: ["Month-to-month not included"],
    said: "$25 a seat from 50 seats and $19.50 from 200. No per-account fee, separate accounts for everyone.",
    cited: "The best offer in hand is $18.70 a seat.",
  },
];

function turns(name: string, p: Plan, seats: number, startups: number, abandoned: string): Call["transcriptTurns"] {
  const t: [string, string][] = [
    ["agent", `Hi, I'm an AI procurement agent calling for want-it, a marketplace that pools startup demand. Is this ${name} sales?`],
    ["vendor", `Yes, this is ${name}. How can I help?`],
    ["agent", `${startups} startups want ${seats} SOC 2 seats in total, each with its own account. ${abandoned}${p.cited ? ` ${p.cited}` : ""}`],
    ["vendor", "Let me look at that volume. Are the accounts separate, and when do you need an answer?"],
    ["agent", "Separate accounts, and the window closes in about 72 hours. What group tiers can you offer?"],
    ["vendor", p.said],
    ["agent", "Thanks. Confirming: separate accounts for each company, and the quote holds for seven days?"],
    ["vendor", "That's right. Seven days, and I'll note it as first-year pricing."],
  ];
  return t.map(([speaker, text], i) => ({ speaker, text, startMs: i * 6500 + (i % 3) * 800 }));
}

export function buildNegotiationFixture(stage: NegotiationFixtureStage): { view: PoolView; run: RunState } {
  const base = buildFixture("open");
  const nowMs = Date.now();
  const startedMs = nowMs - 13 * 60_000;
  const members = base.pool.memberOrderIds.length;
  const seats = base.pool.totalSeats;
  const abandoned = "Our demand data shows 67 of 212 startups abandoned SOC 2 checkout over price in 90 days.";

  const calls: Call[] = [];
  const quotes: Quote[] = [];
  const doneCount = stage === "idle" ? 0 : stage === "running" ? 3 : 5;

  PLANS.forEach((p, i) => {
    const vendor = VENDORS.find((v) => v.id === p.id)!;
    if (i >= doneCount + (stage === "running" ? 1 : 0)) return;
    const startedAt = new Date(startedMs + i * 3 * 60_000).toISOString();
    const inFlight = stage === "running" && i === doneCount;
    const all = turns(vendor.name, p, seats, members, abandoned);
    const call: Call = {
      id: `neg_call_${i + 1}`,
      poolId: base.pool.id,
      vendorId: p.id,
      sequence: i + 1,
      dialCallId: null,
      status: inFlight ? "in_progress" : "extracted",
      source: "live",
      recordedAt: null,
      instruction: "vendor_mode=ai\nNegotiate a group price for the pool.",
      transcriptTurns: inFlight ? all.slice(0, 5) : all,
      error: null,
      startedAt,
      endedAt: inFlight ? null : new Date(startedMs + i * 3 * 60_000 + 168_000).toISOString(),
    };
    calls.push(call);
    if (!inFlight) {
      quotes.push({
        id: `neg_quote_${i + 1}`,
        callId: call.id,
        vendorId: p.id,
        tiers: p.tiers.map(([minSeats, dollars]) => ({ minSeats, pricePerSeatCents: Math.round(dollars * 100) })),
        perAccountFeeCents: p.feeDollars * 100,
        separateAccountsConfirmed: true,
        expiresAt: new Date(nowMs + 7 * 24 * 3600_000).toISOString(),
        conditions: p.conditions,
        evidence: p.said,
        status: "supplier_stated",
        createdAt: call.endedAt ?? startedAt,
      });
    }
  });

  const run: RunState = {
    running: stage === "running",
    mode: "live",
    order: VENDORS.map((v) => v.id),
    startedAt: stage === "idle" ? null : new Date(startedMs).toISOString(),
    finishedAt: stage === "done" ? new Date(nowMs - 60_000).toISOString() : null,
  };

  const view: PoolView = {
    ...base,
    pool: { ...base.pool, status: stage === "done" ? "deal_found" : stage === "running" ? "negotiating" : "open" },
    vendors: VENDORS,
    calls,
    quotes,
  };
  return { view, run };
}
