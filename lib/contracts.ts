// Shared contracts. Owned by Lead — announce changes in WIP/LOG.md.
// Money: integer cents, USD, per seat unless the field name says "total".
import { z } from "zod";

export const Category = z.enum(["soc2_compliance", "dev_tools"]);
export type Category = z.infer<typeof Category>;

export const OrderStatus = z.enum([
  "held", // order confirmed, card hold placed (simulated)
  "pooled", // counted in the open pool
  "negotiating", // pool is negotiating with vendors
  "deal_applied", // group price applied (<= cap, < list)
  "list_price", // no better deal; will pay list
  "canceled_over_max", // final price above buyer's max; hold released
  "canceled_by_buyer",
  "charged", // simulated capture done
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const Order = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  buyerName: z.string(),
  isSimulated: z.boolean(),
  category: Category,
  seats: z.number().int().positive(),
  maxPricePerSeatCents: z.number().int().positive().nullable(),
  preferredVendorId: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  city: z.string(),
  deadline: z.string(), // ISO
  holdAmountCents: z.number().int(), // total = seats * min(list, max)
  status: OrderStatus,
  finalPricePerSeatCents: z.number().int().nullable(),
  redemptionLink: z.string().nullable(),
  poolId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Order = z.infer<typeof Order>;

export const CreateOrderInput = z.object({
  idempotencyKey: z.string().min(8),
  buyerName: z.string().min(1),
  category: Category,
  seats: z.number().int().min(1).max(500),
  maxPricePerSeatCents: z.number().int().positive().nullable(),
  preferredVendorId: z.string().nullable(),
  city: z.string().default("San Francisco"),
  lat: z.number().default(37.7749),
  lng: z.number().default(-122.4194),
  deadline: z.string().optional(), // ISO; default = pool window close + 7d
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export const Vendor = z.object({
  id: z.string(), // "certly" | "vantly"
  name: z.string(),
  isTestVendor: z.literal(true),
  category: Category,
  listPricePerSeatCents: z.number().int(),
});
export type Vendor = z.infer<typeof Vendor>;

export const ExclusionReason = z.enum(["wrong_category", "deadline_before_window", "canceled"]);
export const PoolStatus = z.enum(["open", "negotiating", "deal_found", "no_deal", "settled"]);
export const Pool = z.object({
  id: z.string(),
  category: Category,
  windowClosesAt: z.string(),
  status: PoolStatus,
  memberOrderIds: z.array(z.string()),
  exclusions: z.array(z.object({ orderId: z.string(), reason: ExclusionReason })),
  totalSeats: z.number().int(),
});
export type Pool = z.infer<typeof Pool>;

export const TranscriptTurn = z.object({ speaker: z.string(), text: z.string(), startMs: z.number() });
export const CallStatus = z.enum(["queued", "in_progress", "ended", "transcribed", "extracted", "failed"]);
export const Call = z.object({
  id: z.string(),
  poolId: z.string(),
  vendorId: z.string(),
  sequence: z.number().int(), // 1 = Certly, 2 = Vantly, 3 = Certly callback
  dialCallId: z.string().nullable(),
  status: CallStatus,
  source: z.enum(["live", "recorded_replay"]),
  recordedAt: z.string().nullable(), // set when source = recorded_replay
  instruction: z.string(),
  transcriptTurns: z.array(TranscriptTurn),
  error: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type Call = z.infer<typeof Call>;

export const Quote = z.object({
  id: z.string(),
  callId: z.string(),
  vendorId: z.string(),
  tiers: z.array(z.object({ minSeats: z.number().int(), pricePerSeatCents: z.number().int() })),
  perAccountFeeCents: z.number().int(), // per buyer account; 0 if not stated
  separateAccountsConfirmed: z.boolean().nullable(),
  expiresAt: z.string().nullable(),
  conditions: z.array(z.string()),
  evidence: z.string(), // verbatim transcript snippet supporting the terms
  status: z.literal("supplier_stated"),
  createdAt: z.string(),
});
export type Quote = z.infer<typeof Quote>;

export const DemandEvidence = z.object({
  source: z.enum(["keewano_live", "keewano_cached", "unavailable"]),
  queryText: z.string(),
  ranAt: z.string().nullable(),
  interestedBuyers90d: z.number().int().nullable(),
  abandonedOverPrice90d: z.number().int().nullable(),
  medianMaxPricePerSeatCents: z.number().int().nullable(),
  isSyntheticHistory: z.boolean(),
  summary: z.string(),
});
export type DemandEvidence = z.infer<typeof DemandEvidence>;

export const DemandEventType = z.enum(["order_placed", "order_canceled", "max_price_stated", "deal_applied", "canceled_over_max"]);
export const DemandEvent = z.object({
  type: DemandEventType,
  orderId: z.string(),
  category: Category,
  seats: z.number().int().optional(),
  priceCents: z.number().int().optional(),
  at: z.string(),
});
export type DemandEvent = z.infer<typeof DemandEvent>;

export const Benchmark = z.object({
  steps: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      baselineMinutesPerBuyer: z.number(),
      ourMinutesPerBuyer: z.number(),
      kind: z.enum(["observed", "estimate"]),
      note: z.string(),
    }),
  ),
  vendorSalesMinutesPerCustomer: z.number(),
  kindNote: z.string(),
});
export type Benchmark = z.infer<typeof Benchmark>;

// GET /api/pool response
export type PoolView = {
  now: string;
  clockOffsetHours: number;
  demoMode: boolean;
  pool: Pool;
  orders: Order[]; // all orders incl. excluded
  vendors: Vendor[];
  calls: Call[];
  quotes: Quote[];
  evidence: DemandEvidence;
  timeSaved: TimeSaved;
};

export type TimeSaved = {
  buyers: number;
  baselineMinutesTotal: number;
  ourMinutesTotal: number;
  netHumanMinutesSaved: number;
  vendorSalesCyclesAvoided: number;
  agentCallMinutes: number; // shown separately, not human time
  moneySavedCents: number; // shown separately
  hasEstimates: boolean;
};
