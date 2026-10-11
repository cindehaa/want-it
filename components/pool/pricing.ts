import type { Order, PoolView } from "@/lib/contracts";
import { effectiveAllIn } from "@/lib/dial/prompt";
import { listPriceFor } from "@/lib/vendors";

/** Reference list price per seat for the pool's category ($30 for SOC 2). */
export function listCents(view: PoolView): number {
  const p = listPriceFor(view.pool.category, null);
  return Number.isFinite(p) ? p : 3000;
}

function members(view: PoolView): Order[] {
  const ids = new Set(view.pool.memberOrderIds);
  return view.orders.filter((o) => ids.has(o.id));
}

/**
 * Best group price today: lowest seat-weighted effective price (lib/settle effectivePrice semantics) across
 * supplier-stated quotes, over the buyers each quote covers. Null when no quote beats list.
 */
export function bestGroupPrice(view: PoolView): number | null {
  const list = listCents(view);
  const ms = members(view);
  let best: number | null = null;
  for (const q of view.quotes) {
    const offer = effectiveAllIn(q, ms, new Date(view.now));
    if (offer && (best == null || offer.allInPerSeatCents < best)) best = offer.allInPerSeatCents;
  }
  return best != null && best < list ? best : null;
}

/** Price per seat a buyer of `seats` gets today (tier at current pool size + per-account fee share). */
export function yourPrice(view: PoolView, seats: number): number | null {
  const list = listCents(view);
  const ms = members(view);
  let best: number | null = null;
  for (const q of view.quotes) {
    const offer = effectiveAllIn(q, ms, new Date(view.now));
    if (!offer) continue;
    const p = Math.round(offer.tierPricePerSeatCents + q.perAccountFeeCents / Math.max(1, seats));
    if (best == null || p < best) best = p;
  }
  return best != null && best < list ? best : null;
}

export function productName(category: string): string {
  if (category === "soc2_compliance") return "SOC 2 compliance seats";
  if (category === "dev_tools") return "Dev tools seats";
  return `${category.replace(/_/g, " ")} seats`;
}
