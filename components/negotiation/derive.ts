// Pure derivations for the negotiation room. Price semantics mirror lib/settle/index.ts:
// tierPrice = lowest price among tiers whose minSeats <= pool seats; effective = tier + perAccountFee / seats-per-buyer.
import benchmark from "@/data/benchmark.json";
import type { Call, Order, PoolView, Quote, Vendor } from "@/lib/contracts";
import { effectiveAllIn } from "@/lib/dial/prompt";
import { listPriceFor } from "@/lib/vendors";
export { callMinutes } from "@/lib/dial/duration";

export type RunState = {
  running: boolean;
  mode: string;
  order: string[];
  startedAt: string | null;
  finishedAt: string | null;
  error?: string | null;
  vendorStates?: Record<string, string>;
  /** Parallel live run (every vendor dialed at once). Optional so fixtures stay valid. */
  parallel?: boolean;
  round?: number;
  /** DIAL_PARALLEL_LANES is configured server-side (>= 2 lanes). */
  parallelAvailable?: boolean;
};

export function parseRun(v: unknown): RunState | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  // Tolerate both a bare run object and { run: {...} }.
  const r = (o.run && typeof o.run === "object" ? (o.run as Record<string, unknown>) : o) as Record<string, unknown>;
  if (typeof r.running !== "boolean") return null;
  return {
    running: r.running,
    mode: typeof r.mode === "string" ? r.mode : "live",
    order: Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === "string") : [],
    startedAt: typeof r.startedAt === "string" ? r.startedAt : null,
    finishedAt: typeof r.finishedAt === "string" ? r.finishedAt : null,
    error: typeof r.error === "string" ? r.error : null,
    vendorStates: Object.fromEntries(((o.progress as { vendors?: { vendorId: string; state: string }[] } | undefined)?.vendors ?? []).map((v) => [v.vendorId, v.state])),
    parallel: r.parallel === true,
    round: typeof r.round === "number" ? r.round : 1,
    parallelAvailable: o.parallelAvailable === true,
  };
}

export function tierPrice(q: Quote, seats: number): number | null {
  const ok = q.tiers.filter((t) => seats >= t.minSeats).sort((a, b) => a.pricePerSeatCents - b.pricePerSeatCents);
  return ok[0]?.pricePerSeatCents ?? null;
}

export type PoolFacts = { startups: number; seats: number; avgSeats: number };

export function poolFacts(view: PoolView): PoolFacts {
  const startups = view.pool.memberOrderIds.length;
  const seats = view.pool.totalSeats;
  return { startups, seats, avgSeats: startups > 0 ? seats / startups : seats || 1 };
}

export type Effective = { tierCents: number; feePerSeatCents: number; effectiveCents: number; appliedMinSeats: number };

export function effectiveFor(q: Quote, members: Order[], at: Date): Effective | null {
  const offer = effectiveAllIn(q, members, at);
  if (!offer) return null;
  const tier = offer.tierPricePerSeatCents;
  const applied = q.tiers.find((t) => t.pricePerSeatCents === tier && offer.seats >= t.minSeats);
  return { tierCents: tier, feePerSeatCents: offer.allInPerSeatCents - tier, effectiveCents: offer.allInPerSeatCents, appliedMinSeats: applied?.minSeats ?? 0 };
}

export type LaneStatus = "waiting" | "calling" | "transcribing" | "extracted" | "failed" | "no_recording";

export type Lane = {
  vendor: Vendor;
  index: number;
  call: Call | null;
  quote: Quote | null;
  quotedTier: Quote["tiers"][number] | null;
  status: LaneStatus;
  eff: Effective | null;
  /** Counts toward the ranking: separate accounts confirmed (SPEC section 4) and a tier exists at pool size. */
  eligible: boolean;
  /** Best effective price (cents) from earlier lanes: what the agent could cite entering this call. */
  bestBefore: number | null;
};

function laneStatus(call: Call | null, run: RunState | null, vendorId: string): LaneStatus {
  if (!call) {
    if (run && !run.running && run.finishedAt && run.order.includes(vendorId)) {
      const state = run.vendorStates?.[vendorId];
      if (state === "no_recording") return "no_recording";
      if (state === "failed") return "failed";
      if (!run.error && !state) return run.mode === "replay" ? "no_recording" : "failed";
    }
    return "waiting";
  }
  switch (call.status) {
    case "queued":
    case "in_progress":
      return "calling";
    case "ended":
    case "transcribed":
      return "transcribing";
    case "extracted":
      return "extracted";
    case "failed":
      return /no (recorded|recording)|recording (not|missing)|nothing recorded/i.test(call.error ?? "") ? "no_recording" : "failed";
  }
}

/** Lane order: the run's order when known, else the vendors' call sequence, then anything left. */
export function orderVendors(view: PoolView, run: RunState | null): Vendor[] {
  const byId = new Map(view.vendors.map((v) => [v.id, v]));
  const out: Vendor[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    const v = byId.get(id);
    if (v && !seen.has(id)) {
      seen.add(id);
      out.push(v);
    }
  };
  if (run && run.order.length > 0) run.order.forEach(push);
  else [...view.calls].sort((a, b) => a.sequence - b.sequence).forEach((c) => push(c.vendorId));
  view.vendors.forEach((v) => push(v.id));
  return out;
}

export function buildLanes(view: PoolView, run: RunState | null): Lane[] {
  const ids = new Set(view.pool.memberOrderIds);
  const members = view.orders.filter((o) => ids.has(o.id));
  const vendors = orderVendors(view, run);
  let best: number | null = null;
  return vendors.map((vendor, index) => {
    const calls = view.calls.filter((c) => c.vendorId === vendor.id).sort((a, b) => b.sequence - a.sequence);
    const call = calls[0] ?? null;
    const quote = call ? (view.quotes.find((q) => q.callId === call.id) ?? null) : null;
    const offeredSeats = members.filter((order) => !order.preferredVendorId || order.preferredVendorId === vendor.id).reduce((sum, order) => sum + order.seats, 0);
    const quotedTier = quote && (quote.expiresAt === null || Date.parse(quote.expiresAt) > Date.parse(view.now))
      ? quote.tiers.filter((tier) => tier.minSeats <= offeredSeats).sort((a, b) => a.pricePerSeatCents - b.pricePerSeatCents)[0] ?? null
      : null;
    const eff = quote ? effectiveFor(quote, members, new Date(view.now)) : null;
    const eligible = !!quote && quote.separateAccountsConfirmed === true && !!eff;
    const lane: Lane = { vendor, index, call, quote, quotedTier, status: laneStatus(call, run, vendor.id), eff, eligible, bestBefore: best };
    if (eligible && eff && (best == null || eff.effectiveCents < best)) best = eff.effectiveCents;
    return lane;
  });
}

/** Ranked by effective price; vendors without an eligible quote follow in lane order. */
export function rankLanes(lanes: Lane[]): Lane[] {
  const ranked = lanes.filter((l) => l.eligible).sort((a, b) => (a.eff?.effectiveCents ?? 0) - (b.eff?.effectiveCents ?? 0));
  const rest = lanes.filter((l) => !l.eligible);
  return [...ranked, ...rest];
}

export type ChartPoint = { label: string; best: number | null; offer: number | null };

/** "Best offer so far" per call, in lane order. Dollars per seat. Uncalled vendors stay null so the line grows. */
export function ratchetSeries(lanes: Lane[]): { points: ChartPoint[]; lowestList: number } {
  const lowestList = listPriceFor(lanes[0]?.vendor.category ?? "soc2_compliance", null);
  const points: ChartPoint[] = [{ label: "List", best: lowestList / 100, offer: null }];
  let best = lowestList;
  for (const l of lanes) {
    const done = l.status === "extracted" || l.status === "failed" || l.status === "no_recording";
    if (!done) {
      points.push({ label: l.vendor.name, best: null, offer: null });
      continue;
    }
    let offer: number | null = null;
    if (l.eligible && l.eff) {
      offer = l.eff.effectiveCents;
      best = Math.min(best, offer);
    }
    points.push({ label: l.vendor.name, best: best / 100, offer: offer == null ? null : offer / 100 });
  }
  return { points, lowestList };
}

const HUMAN_STEP_IDS = ["contact_sales", "sales_call", "negotiate"] as const;

export type HumanBaseline = {
  perVendorMinutes: number;
  steps: { id: string; label: string; minutes: number }[];
  isEstimate: boolean;
};

export function humanBaseline(): HumanBaseline {
  const steps = HUMAN_STEP_IDS.map((id) => benchmark.steps.find((s) => s.id === id)).filter((s): s is (typeof benchmark.steps)[number] => !!s);
  return {
    perVendorMinutes: steps.reduce((s, x) => s + x.baselineMinutesPerBuyer, 0),
    steps: steps.map((s) => ({ id: s.id, label: s.label, minutes: s.baselineMinutesPerBuyer })),
    isEstimate: steps.some((s) => s.kind === "estimate"),
  };
}
