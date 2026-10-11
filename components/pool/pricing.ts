import type { Order, PoolView, Quote } from "@/lib/contracts";
import { effectivePrice, tierPrice } from "@/lib/settle";
import { listPriceFor } from "@/lib/vendors";

/** Reference list price per seat for the pool's category ($30 for SOC 2). */
export function listCents(view: PoolView): number {
  const p = listPriceFor(view.pool.category, null);
  return Number.isFinite(p) ? p : 3000;
}

/** Quotes that settlement would actually apply (SPEC section 4: separate accounts confirmed). */
function usable(view: PoolView): Quote[] {
  return view.quotes.filter((q) => q.separateAccountsConfirmed === true);
}

function members(view: PoolView): Order[] {
  const ids = new Set(view.pool.memberOrderIds);
  return view.orders.filter((o) => ids.has(o.id));
}

const eligible = (o: Order, q: Quote) => !o.preferredVendorId || o.preferredVendorId === q.vendorId;

/**
 * Best group price today: lowest seat-weighted effective price (lib/settle effectivePrice semantics) across
 * supplier-stated quotes, over the buyers each quote covers. Null when no quote beats list.
 */
export function bestGroupPrice(view: PoolView): number | null {
  const list = listCents(view);
  const ms = members(view);
  let best: number | null = null;
  for (const q of usable(view)) {
    const covered = ms.filter((o) => eligible(o, q));
    const poolSeats = covered.reduce((s, o) => s + o.seats, 0);
    let weighted = 0;
    let seats = 0;
    for (const o of covered) {
      const p = effectivePrice(q, poolSeats, o);
      if (p == null) continue;
      weighted += p * o.seats;
      seats += o.seats;
    }
    if (seats === 0) continue;
    const avg = Math.round(weighted / seats);
    if (best == null || avg < best) best = avg;
  }
  return best != null && best < list ? best : null;
}

/** Price per seat a buyer of `seats` gets today (tier at current pool size + per-account fee share). */
export function yourPrice(view: PoolView, seats: number): number | null {
  const list = listCents(view);
  const ms = members(view);
  let best: number | null = null;
  for (const q of usable(view)) {
    const poolSeats = ms.filter((o) => eligible(o, q)).reduce((s, o) => s + o.seats, 0);
    const tier = tierPrice(q, poolSeats);
    if (tier == null) continue;
    const p = Math.round(tier + q.perAccountFeeCents / Math.max(1, seats));
    if (best == null || p < best) best = p;
  }
  return best != null && best < list ? best : null;
}

export function productName(category: string): string {
  if (category === "soc2_compliance") return "SOC 2 compliance seats";
  if (category === "dev_tools") return "Dev tools seats";
  return `${category.replace(/_/g, " ")} seats`;
}
