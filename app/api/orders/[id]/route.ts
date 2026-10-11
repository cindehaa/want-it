import { NextResponse } from "next/server";
import type { Order } from "@/lib/contracts";
import { all, get } from "@/lib/db";
import { recomputePool } from "@/lib/pool";
import { settleOrders } from "@/lib/settle";
import { listPriceOrDefault } from "@/lib/seed";
import { now } from "@/lib/clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!get("orders", id)) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const pool = recomputePool(); // keeps held -> pooled current
  const order = get("orders", id)!;
  const members = pool.memberOrderIds.map((mid) => get("orders", mid)).filter((o): o is Order => !!o);
  const callIds = new Set(all("calls").filter((c) => c.poolId === pool.id).map((c) => c.id));
  const quotes = all("quotes").filter((q) => callIds.has(q.callId));

  const decision = settleOrders(members, quotes, now()).find((s) => s.orderId === id);
  const best = decision?.status === "deal_applied" ? { price: decision.pricePerSeatCents, vendorId: decision.vendorId } : null;

  const dealVendorId = order.redemptionLink?.match(/\/redeem\/([^/]+)\//)?.[1] ?? null;
  return NextResponse.json({
    order,
    listPricePerSeatCents: listPriceOrDefault(order.category, order.preferredVendorId),
    dealVendorId,
    pool: {
      status: pool.status,
      totalSeats: pool.totalSeats,
      members: pool.memberOrderIds.length,
      windowClosesAt: pool.windowClosesAt,
    },
    quotes: {
      count: quotes.length,
      bestPricePerSeatCents: best?.price ?? null,
      bestVendorId: best?.vendorId ?? null,
    },
  });
}
