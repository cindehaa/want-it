import { NextResponse } from "next/server";
import type { Order } from "@/lib/contracts";
import { all, get } from "@/lib/db";
import { recomputePool } from "@/lib/pool";
import { effectivePrice } from "@/lib/settle";
import { listPriceOrDefault } from "@/lib/seed";

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

  // Best quote this order could currently get (supplier-stated quotes only; never our own asking price).
  let best: { price: number; vendorId: string } | null = null;
  for (const q of quotes) {
    if (q.separateAccountsConfirmed === false) continue;
    if (order.preferredVendorId && q.vendorId !== order.preferredVendorId) continue;
    const poolSeats = members.filter((m) => !m.preferredVendorId || m.preferredVendorId === q.vendorId).reduce((s, m) => s + m.seats, 0);
    const p = effectivePrice(q, poolSeats, order);
    if (p != null && (!best || p < best.price)) best = { price: p, vendorId: q.vendorId };
  }

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
