// Local fixture so the marketplace view renders before /api/pool exists (or when it fails).
// All buyers except "You" are simulated. Vendors are fictional test vendors.
import benchmark from "@/data/benchmark.json";
import type { Call, DemandEvidence, Order, PoolView, Quote, TimeSaved, Vendor } from "@/lib/contracts";

export type FixtureStage = "open" | "quoted" | "settled";

const VENDORS: Vendor[] = [
  { id: "certly", name: "Certly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3000 },
  { id: "vantly", name: "Vantly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3200 },
];
const LIST = 3000;
const HOUR = 3600_000;

type Seed = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  seats: number;
  max: number | null;
  sim?: boolean;
  category?: Order["category"];
  earlyDeadline?: boolean;
};

const SEEDS: Seed[] = [
  { id: "ord_you", name: "Your startup", city: "San Francisco", lat: 37.7749, lng: -122.4194, seats: 12, max: 2400, sim: false },
  { id: "ord_fern", name: "Fernbridge", city: "Oakland", lat: 37.8044, lng: -122.2712, seats: 20, max: 2500 },
  { id: "ord_plume", name: "Plume AI", city: "Palo Alto", lat: 37.4419, lng: -122.143, seats: 35, max: 2200 },
  { id: "ord_tide", name: "Tidepool Health", city: "San Jose", lat: 37.3382, lng: -121.8863, seats: 18, max: null },
  { id: "ord_kestrel", name: "Kestrel Pay", city: "San Francisco", lat: 37.7786, lng: -122.3893, seats: 40, max: 2600 },
  { id: "ord_loom", name: "Loomstack", city: "Berkeley", lat: 37.8715, lng: -122.273, seats: 8, max: 1800 },
  { id: "ord_orbit", name: "Orbit CRM", city: "Mountain View", lat: 37.3861, lng: -122.0839, seats: 25, max: 2800 },
  { id: "ord_basil", name: "Basil Bio", city: "South San Francisco", lat: 37.6547, lng: -122.4077, seats: 15, max: 1900 },
  { id: "ord_quill", name: "Quill Docs", city: "Redwood City", lat: 37.4852, lng: -122.2364, seats: 10, max: null },
  { id: "ord_sun", name: "Sundial Energy", city: "Sunnyvale", lat: 37.3688, lng: -122.0363, seats: 22, max: 2300 },
  { id: "ord_mer", name: "Meridian Ops", city: "Fremont", lat: 37.5485, lng: -121.9886, seats: 14, max: 2100 },
  { id: "ord_vega", name: "Vega Logistics", city: "San Mateo", lat: 37.563, lng: -122.3255, seats: 30, max: 2400 },
  { id: "ord_granite", name: "Granite Tools", city: "Santa Clara", lat: 37.3541, lng: -121.9552, seats: 12, max: 2000, category: "dev_tools" },
  { id: "ord_flux", name: "Flux Mobile", city: "Walnut Creek", lat: 37.9101, lng: -122.0652, seats: 9, max: 2500, earlyDeadline: true },
];

function tierPrice(q: Quote, seats: number): number | null {
  const ok = q.tiers.filter((t) => seats >= t.minSeats).sort((a, b) => a.pricePerSeatCents - b.pricePerSeatCents);
  return ok[0]?.pricePerSeatCents ?? null;
}

export function buildFixture(stage: FixtureStage = "open"): PoolView {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const closesAt = new Date(nowMs + (stage === "settled" ? -1 : 71) * HOUR).toISOString();
  const closed = stage === "settled";

  const quotes: Quote[] = [];
  const calls: Call[] = [];
  if (stage !== "open") {
    const recordedAt = new Date(nowMs - 3 * HOUR).toISOString();
    calls.push({
      id: "call_1",
      poolId: "pool_soc2",
      vendorId: "certly",
      sequence: 1,
      dialCallId: null,
      status: "extracted",
      source: "recorded_replay",
      recordedAt,
      instruction: "Negotiate a group price for 249 SOC 2 seats across 12 startups.",
      transcriptTurns: [
        { speaker: "agent", startMs: 0, text: "Hi, I'm an AI assistant calling for a group of startups buying SOC 2 compliance software. Is this Certly sales?" },
        { speaker: "vendor", startMs: 6200, text: "Yes, this is Certly. Happy to help. How many seats are we talking about?" },
        { speaker: "agent", startMs: 11000, text: "About 249 seats across 12 companies, each with its own account. Your public price is $30 a seat, and 67 buyers walked away at that price in the last 90 days. What group tiers can you offer?" },
        { speaker: "vendor", startMs: 24000, text: "At that volume I can do $27 a seat from 50 seats, $24 from 100, and $21 from 200 seats. First year only." },
        { speaker: "agent", startMs: 33000, text: "Does that include separate accounts for each company, and is there a per-account fee?" },
        { speaker: "vendor", startMs: 39500, text: "Separate accounts, yes. There's a $40 onboarding fee per account." },
        { speaker: "agent", startMs: 46000, text: "Thanks. How long is that quote valid?" },
        { speaker: "vendor", startMs: 50000, text: "Seven days." },
      ],
      error: null,
      startedAt: recordedAt,
      endedAt: new Date(nowMs - 3 * HOUR + 62_000).toISOString(),
    });
    quotes.push({
      id: "quote_1",
      callId: "call_1",
      vendorId: "certly",
      tiers: [
        { minSeats: 50, pricePerSeatCents: 2700 },
        { minSeats: 100, pricePerSeatCents: 2400 },
        { minSeats: 200, pricePerSeatCents: 2100 },
      ],
      perAccountFeeCents: 4000,
      separateAccountsConfirmed: true,
      expiresAt: new Date(nowMs + 7 * 24 * HOUR).toISOString(),
      conditions: ["First-year pricing only", "Annual prepay"],
      evidence: "At that volume I can do $27 a seat from 50 seats, $24 from 100, and $21 from 200 seats.",
      status: "supplier_stated",
      createdAt: recordedAt,
    });
    const callStart = new Date(nowMs - 8 * 60_000).toISOString();
    calls.push({
      id: "call_2",
      poolId: "pool_soc2",
      vendorId: "vantly",
      sequence: 2,
      dialCallId: "dial_abc123",
      status: "extracted",
      source: "live",
      recordedAt: null,
      instruction: "Certly quoted $21 a seat at 200+ seats. Ask Vantly to beat it.",
      transcriptTurns: [
        { speaker: "agent", startMs: 0, text: "Hi, I'm calling for a group of 12 startups, 249 SOC 2 seats in total. Another vendor offered $21 a seat at 200 seats or more. Can you beat that?" },
        { speaker: "vendor", startMs: 9000, text: "Let me check. For 240 seats and up we can do $19 a seat." },
        { speaker: "agent", startMs: 16000, text: "Separate accounts for each company, and any per-account fee?" },
        { speaker: "vendor", startMs: 21000, text: "Separate accounts, no per-account fee. Tiers are $26 from 75 seats, $23 from 150, and $19 from 240." },
      ],
      error: null,
      startedAt: callStart,
      endedAt: new Date(nowMs - 8 * 60_000 + 74_000).toISOString(),
    });
    quotes.push({
      id: "quote_2",
      callId: "call_2",
      vendorId: "vantly",
      tiers: [
        { minSeats: 75, pricePerSeatCents: 2600 },
        { minSeats: 150, pricePerSeatCents: 2300 },
        { minSeats: 240, pricePerSeatCents: 1900 },
      ],
      perAccountFeeCents: 0,
      separateAccountsConfirmed: true,
      expiresAt: new Date(nowMs + 5 * 24 * HOUR).toISOString(),
      conditions: ["First-year pricing only"],
      evidence: "Separate accounts, no per-account fee. Tiers are $26 from 75 seats, $23 from 150, and $19 from 240.",
      status: "supplier_stated",
      createdAt: callStart,
    });
  }

  const memberSeeds = SEEDS.filter((s) => !s.category && !s.earlyDeadline);
  const totalSeats = memberSeeds.reduce((s, o) => s + o.seats, 0);
  const best = quotes.map((q) => tierPrice(q, totalSeats)).filter((p): p is number => p != null);
  const finalPrice = best.length ? Math.min(...best) : null;

  const orders: Order[] = SEEDS.map((s) => {
    const member = !s.category && !s.earlyDeadline;
    const cap = Math.min(LIST, s.max ?? LIST);
    let status: Order["status"] = stage === "open" ? "pooled" : "negotiating";
    let finalPricePerSeatCents: number | null = null;
    if (member && stage === "settled" && finalPrice != null) {
      if (finalPrice <= cap) {
        status = "deal_applied";
        finalPricePerSeatCents = finalPrice;
      } else {
        status = "canceled_over_max";
      }
    }
    return {
      id: s.id,
      idempotencyKey: `fixture-${s.id}`,
      buyerName: s.name,
      isSimulated: s.sim !== false,
      category: s.category ?? "soc2_compliance",
      seats: s.seats,
      maxPricePerSeatCents: s.max,
      preferredVendorId: null,
      lat: s.lat,
      lng: s.lng,
      city: s.city,
      deadline: new Date(nowMs + (s.earlyDeadline ? 24 : 24 * 14) * HOUR).toISOString(),
      holdAmountCents: s.seats * cap,
      status: member ? status : "held",
      finalPricePerSeatCents,
      redemptionLink: null,
      poolId: member ? "pool_soc2" : null,
      createdAt: new Date(nowMs - 6 * HOUR).toISOString(),
      updatedAt: now,
    };
  });

  const members = orders.filter((o) => memberSeeds.some((s) => s.id === o.id));
  const base = benchmark.steps.reduce((s, x) => s + x.baselineMinutesPerBuyer, 0);
  const ours = benchmark.steps.reduce((s, x) => s + x.ourMinutesPerBuyer, 0);
  const liveCalls = calls.filter((c) => c.status !== "failed").length;
  const timeSaved: TimeSaved = {
    buyers: members.length,
    baselineMinutesTotal: members.length * base,
    ourMinutesTotal: members.length * ours,
    netHumanMinutesSaved: members.length * (base - ours),
    vendorSalesCyclesAvoided: Math.max(0, members.length - liveCalls),
    agentCallMinutes: calls.reduce(
      (s, c) => s + (c.endedAt ? Math.round((new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 60000) : 0),
      0,
    ),
    moneySavedCents: members
      .filter((o) => o.status === "deal_applied")
      .reduce((s, o) => s + o.holdAmountCents - (o.finalPricePerSeatCents ?? 0) * o.seats, 0),
    hasEstimates: benchmark.steps.some((s) => s.kind === "estimate"),
  };

  const evidence: DemandEvidence = {
    source: "keewano_cached",
    queryText:
      "SELECT count(DISTINCT user_id) AS interested,\n       count(DISTINCT user_id) FILTER (WHERE event = 'abandoned_over_price') AS abandoned,\n       percentile_cont(0.5) WITHIN GROUP (ORDER BY max_price_cents) AS median_max\nFROM events\nWHERE category = 'soc2_compliance'\n  AND ts > now() - interval '90 days'",
    ranAt: new Date(nowMs - 2 * HOUR).toISOString(),
    interestedBuyers90d: 212,
    abandonedOverPrice90d: 67,
    medianMaxPricePerSeatCents: 2350,
    isSyntheticHistory: true,
    summary: "67 of 212 startups that looked at SOC 2 software in the last 90 days left because the list price was too high. Half of them would pay $23.50 a seat or more.",
  };

  return {
    now,
    clockOffsetHours: closed ? 72 : 0,
    demoMode: true,
    pool: {
      id: "pool_soc2",
      category: "soc2_compliance",
      windowClosesAt: closesAt,
      status: stage === "open" ? "open" : stage === "quoted" ? "deal_found" : "settled",
      memberOrderIds: members.map((o) => o.id),
      exclusions: [
        { orderId: "ord_granite", reason: "wrong_category" },
        { orderId: "ord_flux", reason: "deadline_before_window" },
      ],
      totalSeats,
    },
    orders,
    vendors: VENDORS,
    calls,
    quotes,
    evidence,
    timeSaved,
  };
}
