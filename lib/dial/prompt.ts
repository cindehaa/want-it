// Builds the outbound phone-agent system prompt from REAL pool state. Every number in here comes from
// our DB / Keewano / extracted supplier quotes. The agent is told never to state anything else.
import type { DemandEvidence, Order, Pool, Quote, Vendor } from "@/lib/contracts";
import { tierPrice } from "@/lib/settle";

export type BuildInstructionInput = {
  vendor: Vendor;
  pool: Pool;
  members: Order[]; // pool member orders (we filter to the ones that count toward this vendor)
  evidence: DemandEvidence;
  priorQuotes: Quote[]; // all extracted quotes so far (any vendor)
  now?: Date; // app clock
};

const usd = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function fmtDeadline(iso: string, now: Date): string {
  const d = new Date(iso);
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short",
  }).format(d);
  const hours = Math.round((d.getTime() - now.getTime()) / 3600_000);
  return hours > 0 ? `${when} (about ${plural(hours, "hour")} from now)` : when;
}

/** Cumulative max-price distribution: "3 startups (12 seats) won't buy above $20/seat; ..." */
export function maxPriceLines(members: Order[]): { lines: string[]; uncapped: number; uncappedSeats: number } {
  const capped = members.filter((o) => o.maxPricePerSeatCents != null);
  const values = [...new Set(capped.map((o) => o.maxPricePerSeatCents as number))].sort((a, b) => a - b);
  const lines = values.map((v) => {
    const grp = capped.filter((o) => (o.maxPricePerSeatCents as number) <= v);
    const seats = grp.reduce((s, o) => s + o.seats, 0);
    return `${plural(grp.length, "startup")} (${plural(seats, "seat")}) will not buy above ${usd(v)}/seat`;
  });
  const un = members.filter((o) => o.maxPricePerSeatCents == null);
  return { lines, uncapped: un.length, uncappedSeats: un.reduce((s, o) => s + o.seats, 0) };
}

function describeQuote(q: Quote): string {
  const tiers = [...q.tiers].sort((a, b) => a.minSeats - b.minSeats);
  const t = tiers.map((x) => `${usd(x.pricePerSeatCents)}/seat at ${x.minSeats}+ seats`).join(", ");
  const fee = q.perAccountFeeCents > 0 ? `, plus a ${usd(q.perAccountFeeCents)} per-account fee` : "";
  return `${t}${fee}`;
}

export function bestCompetitorQuote(vendorId: string, quotes: Quote[], seats: number): Quote | null {
  const others = quotes.filter((q) => q.vendorId !== vendorId && q.tiers.length > 0);
  if (others.length === 0) return null;
  const score = (q: Quote) => tierPrice(q, seats) ?? Math.min(...q.tiers.map((t) => t.pricePerSeatCents)) + 1_000_000; // unreachable tiers rank last
  return others.slice().sort((a, b) => score(a) - score(b))[0];
}

export function buildInstruction({ vendor, pool, members, evidence, priorQuotes, now = new Date() }: BuildInstructionInput): string {
  // Preferred-vendor orders only count toward that vendor's quote (SPEC §4).
  const eligible = members.filter((o) => !o.preferredVendorId || o.preferredVendorId === vendor.id);
  const n = eligible.length;
  const seats = eligible.reduce((s, o) => s + o.seats, 0);
  const holdCount = eligible.filter((o) => ["held", "pooled", "negotiating"].includes(o.status)).length;
  const holdTotal = eligible.reduce((s, o) => s + o.holdAmountCents, 0);
  const dist = maxPriceLines(eligible);

  const facts: string[] = [];
  facts.push(`want-it has ${plural(n, "startup")} that each want SOC 2 compliance software seats from you, ${plural(seats, "seat")} in total.`);
  facts.push(`The group buying window closes ${fmtDeadline(pool.windowClosesAt, now)}.`);
  facts.push(
    `${holdCount === n ? `All ${plural(n, "startup")} ${n === 1 ? "has" : "have"}` : `${holdCount} of those ${plural(n, "startup")} already ${holdCount === 1 ? "has" : "have"}`} a payment-card authorization hold in place (holds totaling about ${usd(holdTotal)}). They are committed to buy if the price lands at or below their own maximum. If asked: these are authorization holds, not charges, and in this pilot the holds are simulated.`,
  );
  facts.push(`Each startup needs its OWN separate account with ${vendor.name}. want-it never holds or shares credentials; it only brokers the group price.`);
  facts.push(`${vendor.name}'s list price is ${usd(vendor.listPricePerSeatCents)} per seat.`);
  if (dist.lines.length > 0) {
    facts.push(`Price sensitivity of the pooled buyers: ${dist.lines.join("; ")}.${dist.uncapped > 0 ? ` Separately, ${plural(dist.uncapped, "startup")} (${plural(dist.uncappedSeats, "seat")}) stated no cap beyond list price.` : ""}`);
  } else {
    facts.push("None of the pooled buyers has stated a maximum price; they would pay up to list.");
  }

  // Keewano demand evidence (only if actually available).
  if (evidence.source !== "unavailable" && (evidence.interestedBuyers90d != null || evidence.abandonedOverPrice90d != null)) {
    const bits: string[] = [];
    if (evidence.interestedBuyers90d != null) bits.push(`${plural(evidence.interestedBuyers90d, "startup")} looked for SOC 2 compliance software in the last 90 days`);
    if (evidence.abandonedOverPrice90d != null) bits.push(`${evidence.abandonedOverPrice90d} of them abandoned at checkout over price`);
    let line = `Our demand data shows ${bits.join(" and ")}.`;
    if (evidence.medianMaxPricePerSeatCents != null) line += ` The median maximum price those buyers state is about ${usd(evidence.medianMaxPricePerSeatCents)}/seat.`;
    line += " Demand that walks away at list price is business that is not being won today, so a group deal at a lower price would be incremental.";
    if (evidence.isSyntheticHistory) line += " If asked where this data comes from: it is want-it's demand tracker, and the history is simulated for this pilot.";
    facts.push(line);
  }

  // Prior quotes (truthfully cited, supplier-stated only).
  const competitor = bestCompetitorQuote(vendor.id, priorQuotes, seats);
  if (competitor) {
    const cname = competitor.vendorId.charAt(0).toUpperCase() + competitor.vendorId.slice(1);
    facts.push(`On an earlier call, ${cname} told us: ${describeQuote(competitor)}${competitor.expiresAt ? ` (valid until ${new Date(competitor.expiresAt).toUTCString()})` : ""}. You may cite this and ask whether ${vendor.name} can beat it.`);
  }
  const own = priorQuotes.filter((q) => q.vendorId === vendor.id && q.tiers.length > 0);
  if (own.length > 0) {
    facts.push(`On an earlier call, ${vendor.name} itself told us: ${describeQuote(own[own.length - 1])}. You may ask whether ${vendor.name} can improve on its own earlier offer now.`);
  }

  const ask = [
    `1. The per-seat price by seat-count tier. Ask what the best per-seat price is at our total of ${plural(seats, "seat")}, and whether better pricing exists at higher volumes.`,
    "2. Whether there is any per-account fee (setup, admin, or onboarding) per buyer.",
    "3. Confirmation that each startup gets its own separate account at the group price.",
    "4. How long the offer is valid (expiry date) and any conditions (first-year-only discount, annual prepay, minimums).",
  ];

  return [
    `You are the procurement agent for want-it, a marketplace that pools startup demand to negotiate group prices on software. You are making an outbound phone call to ${vendor.name} sales about SOC 2 compliance software seats. You are an AI agent and you must say so.`,
    "",
    "OPENING (first sentence of the call): say you are an AI procurement agent calling on behalf of want-it, a marketplace that pools startup demand, and ask if they have two minutes to discuss group pricing for SOC 2 compliance software. The sales contact may be a human or an AI sales agent; run the same call either way. If the person cannot discuss pricing, ask politely for the right person. If you reach voicemail or an automated phone menu (not a conversational sales contact), end the call without leaving any figures.",
    "",
    "FACTS you may state (these are the ONLY facts you may state):",
    ...facts.map((f) => `- ${f}`),
    "",
    "YOUR GOAL: get the vendor to state, clearly and out loud:",
    ...ask,
    "",
    "HOW TO NEGOTIATE: Be friendly, direct, and brief. Lead with the pooled demand and the committed buyers, then ask for tiered pricing. If the price is above what the buyers will accept, say so using the price-sensitivity facts above and ask what would close the gap (for example a first-year discount). Push back once or twice at most. You cannot sign or commit anyone: the buyers decide, and each buys only if the final price is at or below their own maximum.",
    "",
    "HARD RULES:",
    "- Never invent numbers, statistics, buyer names, competitor offers, or deadlines. State only the FACTS above. If you do not know something, say you do not have that figure.",
    "- Never claim an offer or quote that the vendor did not state on this call, other than the earlier-call quotes listed in the FACTS.",
    "- Keep every turn short and conversational; ask one question at a time. Finish within 2.5 minutes (the call is hard-capped at 3 minutes).",
    "- Before you finish, repeat the final terms back and ask the vendor to confirm: each tier price, any per-account fee (or none), separate accounts, expiry, and conditions. If the vendor gave no discount, say so back too.",
    "- Then thank them and end the call.",
  ].join("\n");
}
