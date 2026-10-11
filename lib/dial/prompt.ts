// Builds the outbound phone-agent system prompt from REAL pool state. Every number in here comes from
// our DB / Keewano / extracted supplier quotes. The agent is told never to state anything else.
import type { DemandEvidence, Order, Pool, Quote, Vendor } from "@/lib/contracts";
import { effectivePrice, tierPrice } from "@/lib/settle";

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

/** Pool orders a vendor's quote would cover (SPEC §4: preferred-vendor orders count only toward that vendor). */
const eligibleFor = (vendorId: string, members: Order[]) => members.filter((o) => !o.preferredVendorId || o.preferredVendorId === vendorId);

export type BestEffectiveQuote = {
  quote: Quote;
  vendorId: string;
  /** Seat-weighted all-in price per seat: lib/settle effectivePrice (tier price + perAccountFee / order seats) over the orders the quote covers. */
  allInPerSeatCents: number;
  tierPricePerSeatCents: number;
  accounts: number;
  seats: number;
};

/** All-in (effective) price of one quote over the pool orders it would cover; null if it cannot apply (no tier at pool size, no separate accounts, expired). */
export function effectiveAllIn(q: Quote, members: Order[], now: Date = new Date()): BestEffectiveQuote | null {
  if (q.tiers.length === 0 || q.separateAccountsConfirmed !== true) return null;
  if (q.expiresAt && new Date(q.expiresAt).getTime() < now.getTime()) return null;
  const covered = eligibleFor(q.vendorId, members);
  const seats = covered.reduce((s, o) => s + o.seats, 0);
  const tier = tierPrice(q, seats);
  if (seats === 0 || tier == null) return null;
  const total = covered.reduce((s, o) => s + (effectivePrice(q, seats, o) ?? tier) * o.seats, 0);
  return { quote: q, vendorId: q.vendorId, allInPerSeatCents: Math.round(total / seats), tierPricePerSeatCents: tier, accounts: covered.length, seats };
}

/**
 * The best EFFECTIVE (all-in) supplier-stated quote so far, optionally excluding one vendor (the one we are about to call).
 * Only quotes that settlement would consider count (separate accounts confirmed, a tier that applies at the pool size,
 * not expired), so the figure we cite to the next vendor is one a real buyer could actually get.
 */
export function bestEffectiveQuote(quotes: Quote[], members: Order[], opts: { excludeVendorId?: string; now?: Date } = {}): BestEffectiveQuote | null {
  let best: BestEffectiveQuote | null = null;
  for (const q of quotes) {
    if (q.vendorId === opts.excludeVendorId) continue;
    const e = effectiveAllIn(q, members, opts.now);
    if (e && (!best || e.allInPerSeatCents < best.allInPerSeatCents)) best = e;
  }
  return best;
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
  facts.push(`Each startup needs its OWN separate account with ${vendor.name}, and each company gets and pays for its own account. want-it does not resell the software and never holds or shares credentials; it only brokers the group price.`);
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
  const best = bestEffectiveQuote(priorQuotes, members, { excludeVendorId: vendor.id, now });
  if (best) {
    const cname = best.vendorId.charAt(0).toUpperCase() + best.vendorId.slice(1);
    const feeBit = best.quote.perAccountFeeCents > 0 ? `, plus a ${usd(best.quote.perAccountFeeCents)} per-account fee across ${plural(best.accounts, "account")}` : ", with no per-account fee";
    const condBit = best.quote.conditions.length > 0 ? ` Its stated conditions: ${best.quote.conditions.join("; ")}.` : "";
    facts.push(
      `Our best offer so far is ${usd(best.allInPerSeatCents)}/seat all-in from ${cname}. (Detail, only if asked: on an earlier call ${cname} told us ${describeQuote(best.quote)}; at our pool size that is ${usd(best.tierPricePerSeatCents)}/seat${feeBit}, which averages ${usd(best.allInPerSeatCents)}/seat all-in.${condBit}${best.quote.expiresAt ? ` Valid until ${new Date(best.quote.expiresAt).toUTCString()}.` : ""}) After ${vendor.name} states its own first price, say exactly: "Our best offer so far is ${usd(best.allInPerSeatCents)}/seat all-in from ${cname}. Can you beat it?" Do not claim any other competing offer.`,
    );
  }
  const own = priorQuotes.filter((q) => q.vendorId === vendor.id && q.tiers.length > 0);
  if (own.length > 0) {
    facts.push(`On an earlier call, ${vendor.name} itself told us: ${describeQuote(own[own.length - 1])}. You may ask whether ${vendor.name} can improve on its own earlier offer now.`);
  }

  const ask = [
    `1. The per-seat price by seat-count tier. Ask what the best per-seat price is at our total of ${plural(seats, "seat")}, and whether better pricing exists at higher volumes.`,
    "2. Whether there is any per-account fee (setup, admin, or onboarding) per buyer.",
    "3. Confirmation that each startup gets its own separate account at the group price.",
    "4. How long the offer is valid (expiry date) and any conditions (first-year-only discount, annual prepay, minimum commitment term, minimums).",
  ];

  return [
    `You are the procurement agent for want-it, a marketplace that pools startup demand to negotiate group prices on software. You are making an outbound phone call to ${vendor.name} sales about SOC 2 compliance software seats. You are an AI agent and you must say so.`,
    "",
    `OPENING: The sales contact is a stranger who knows nothing about want-it, so give the context they need, briefly and naturally, in your first turn or two. Say who you are (an AI agent calling on behalf of want-it), what want-it is in one sentence (a buying group that pools startups who each want the same software), and the concrete ask: group pricing on SOC 2 compliance software seats for ${plural(n, "startup")}, ${plural(seats, "seat")} in total, where each company gets and pays for its own account. Then STOP and let the contact respond and ask their questions. The contact may be a human or an AI sales agent; run the same call either way. If the person cannot discuss pricing, ask politely for the right person. If you reach voicemail or an automated phone menu (not a conversational sales contact), end the call without leaving any figures.`,
    "",
    "FACTS you may state (these are the ONLY facts you may state):",
    ...facts.map((f) => `- ${f}`),
    "",
    "YOUR GOAL: get the vendor to state, clearly and out loud:",
    ...ask,
    "",
    "HOW TO NEGOTIATE: Be friendly, direct, and brief. After your opening, wait for the contact to respond before giving any numbers, and answer their questions honestly using only the FACTS above (for example how many seats, how billing and accounts work, the timeline). Then ask for tiered pricing. Do not dump the price-sensitivity or demand data up front: share the buyers' price sensitivity and the demand evidence only when the contact pushes back on price, then ask what would close the gap (for example a first-year discount). Push back once or twice at most. You cannot sign or commit anyone: the buyers decide, and each buys only if the final price is at or below their own maximum.",
    "",
    "HARD RULES:",
    "- Never invent numbers, statistics, buyer names, competitor offers, or deadlines. State only the FACTS above. If you do not know something, say you do not have that figure.",
    "- Never claim an offer or quote that the vendor did not state on this call, other than the earlier-call quotes listed in the FACTS.",
    "- Keep every turn short and conversational; ask one question at a time. Keep the whole call under about 3 minutes (it is hard-capped at 3 minutes) and aim to finish within 2.5.",
    "- Before you finish, repeat the final terms back and ask the vendor to confirm: each tier price, any per-account fee (or none), separate accounts, expiry, and conditions. If the vendor gave no discount, say so back too.",
    "- Then thank them and end the call.",
  ].join("\n");
}
