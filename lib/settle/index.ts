// Deterministic settlement (SPEC §4). Single pass; fixed-point iteration is a known edge case.
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

export function settleOrders(members: Order[], quotes: Quote[]): Settlement[] {
  const poolSeatsFor = (vendorId: string) =>
    members.filter((o) => !o.preferredVendorId || o.preferredVendorId === vendorId).reduce((s, o) => s + o.seats, 0);
  return members.map((o) => {
    const list = listPriceFor(o.category, o.preferredVendorId);
    const cap = Math.min(list, o.maxPricePerSeatCents ?? list);
    let best: { price: number; vendorId: string } | null = null;
    for (const q of quotes) {
      if (q.separateAccountsConfirmed === false) continue;
      if (o.preferredVendorId && q.vendorId !== o.preferredVendorId) continue;
      const p = effectivePrice(q, poolSeatsFor(q.vendorId), o);
      if (p != null && (!best || p < best.price)) best = { price: p, vendorId: q.vendorId };
    }
    if (best && best.price <= cap && best.price < list) return { orderId: o.id, status: "deal_applied", pricePerSeatCents: best.price, vendorId: best.vendorId };
    if (o.maxPricePerSeatCents == null || o.maxPricePerSeatCents >= list) return { orderId: o.id, status: "list_price", pricePerSeatCents: list, vendorId: null };
    return { orderId: o.id, status: "canceled_over_max", pricePerSeatCents: null, vendorId: null };
  });
}
