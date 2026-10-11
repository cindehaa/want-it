import { NextResponse } from "next/server";
import type { Order } from "@/lib/contracts";
import { all, get, put } from "@/lib/db";
import { now } from "@/lib/clock";
import { recomputePool } from "@/lib/pool";
import { settleOrders } from "@/lib/settle";
import { listPriceOrDefault } from "@/lib/seed";
import { buildPoolView, emitEvent } from "@/lib/poolView";
import { negotiationInProgress } from "@/lib/dial/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE: Order["status"][] = ["held", "pooled", "negotiating"];

export async function POST() {
  const pool = recomputePool();
  if (pool.status === "settled") return NextResponse.json(await buildPoolView()); // already settled; nothing to redo
  if (negotiationInProgress()) {
    return NextResponse.json({ error: "Negotiation is still in progress. Stop the run and wait for the current call and extraction to finish before settling." }, { status: 409 });
  }

  const members = pool.memberOrderIds.map((id) => get("orders", id)).filter((o): o is Order => !!o && ACTIVE.includes(o.status));
  const callIds = new Set(all("calls").filter((c) => c.poolId === pool.id).map((c) => c.id));
  const quotes = all("quotes").filter((q) => callIds.has(q.callId));

  const byId = new Map(members.map((o) => [o.id, o]));
  const at = now().toISOString();
  let anyDeal = false;
  for (const s of settleOrders(members, quotes, now())) {
    const o = byId.get(s.orderId);
    if (!o) continue;
    if (s.status === "deal_applied") {
      anyDeal = true;
      // TEST link: fictional vendor, not a real redemption URL.
      put("orders", {
        ...o,
        status: "deal_applied",
        finalPricePerSeatCents: s.pricePerSeatCents,
        redemptionLink: `https://example.test/redeem/${s.vendorId}/${o.id}`,
        updatedAt: at,
      });
      emitEvent({ type: "deal_applied", orderId: o.id, category: o.category, seats: o.seats, priceCents: s.pricePerSeatCents ?? undefined, at });
    } else if (s.status === "list_price") {
      put("orders", { ...o, status: "list_price", finalPricePerSeatCents: listPriceOrDefault(o.category, o.preferredVendorId), updatedAt: at });
    } else if (s.status === "canceled_over_max") {
      put("orders", { ...o, status: "canceled_over_max", finalPricePerSeatCents: null, holdAmountCents: 0, updatedAt: at }); // hold released
      emitEvent({ type: "canceled_over_max", orderId: o.id, category: o.category, seats: o.seats, priceCents: o.maxPricePerSeatCents ?? undefined, at });
    }
  }
  put("pools", { ...pool, status: anyDeal ? "deal_found" : "no_deal" });
  put("pools", { ...get("pools", pool.id)!, status: "settled" });
  return NextResponse.json(await buildPoolView());
}
