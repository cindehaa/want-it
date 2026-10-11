// Deterministic settlement. Count only buyers who can actually take each vendor's offer.
import type { Order, Quote } from "@/lib/contracts";
import { listPriceFor } from "@/lib/vendors";

export function tierPrice(q: Quote, seats: number): number | null {
  const ok = q.tiers.filter((t) => seats >= t.minSeats).sort((a, b) => a.pricePerSeatCents - b.pricePerSeatCents);
  return ok[0]?.pricePerSeatCents ?? null;
}

/** Effective per-seat price for one order under quote q at pool size `poolSeats`. */
export function effectivePrice(q: Quote, poolSeats: number, order: Order): number | null {
  const p = tierPrice(q, poolSeats);
  if (p == null) return null;
  return Math.round(p + q.perAccountFeeCents / order.seats);
}

export type Settlement = { orderId: string; status: Order["status"]; pricePerSeatCents: number | null; vendorId: string | null };

export function quoteIsValid(q: Quote, at: Date = new Date()): boolean {
  return q.status === "supplier_stated" && q.separateAccountsConfirmed === true &&
    (q.expiresAt === null || new Date(q.expiresAt).getTime() > at.getTime());
}

export function settleOrders(members: Order[], quotes: Quote[], at: Date = new Date()): Settlement[] {
  const valid = quotes.filter((q) => quoteIsValid(q, at));
  const supported = new Map(valid.map((q) => [q.vendorId, new Set(members.filter((o) => !o.preferredVendorId || o.preferredVendorId === q.vendorId).map((o) => o.id))]));
  const poolSeatsFor = (vendorId: string) =>
    members.filter((o) => supported.get(vendorId)?.has(o.id)).reduce((s, o) => s + o.seats, 0);
  const decide = (): Settlement[] => members.map((o) => {
    const list = listPriceFor(o.category, o.preferredVendorId);
    const cap = Math.min(list, o.maxPricePerSeatCents ?? list);
    let best: { price: number; vendorId: string } | null = null;
    for (const q of valid) {
      if (!supported.get(q.vendorId)?.has(o.id)) continue;
      const p = effectivePrice(q, poolSeatsFor(q.vendorId), o);
      if (p != null && p <= cap && (!best || p < best.price)) best = { price: p, vendorId: q.vendorId };
    }
    if (best && best.price <= cap && best.price < list) return { orderId: o.id, status: "deal_applied", pricePerSeatCents: best.price, vendorId: best.vendorId };
    if (o.maxPricePerSeatCents == null || o.maxPricePerSeatCents >= list) return { orderId: o.id, status: "list_price", pricePerSeatCents: list, vendorId: null };
    return { orderId: o.id, status: "canceled_over_max", pricePerSeatCents: null, vendorId: null };
  });
  // Supports only shrink, so this terminates without oscillating between vendors.
  // It may decline a feasible alternative allocation; it never promises a tier without enough committed seats.
  while (true) {
    const result = decide();
    let changed = false;
    for (const [vendorId, ids] of supported) {
      for (const id of ids) {
        const assigned = result.find((r) => r.orderId === id);
        if (assigned?.vendorId !== vendorId) {
          ids.delete(id);
          changed = true;
        }
      }
    }
    if (!changed) return result;
  }
}
