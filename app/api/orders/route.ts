import { NextResponse } from "next/server";
import { CreateOrderInput, type Order } from "@/lib/contracts";
import { findOrderByIdempotencyKey, get, newId, put } from "@/lib/db";
import { now } from "@/lib/clock";
import { getOrCreatePool, recomputePool } from "@/lib/pool";
import { maybeAutoDispatch } from "@/lib/autoDispatch";
import { VENDORS } from "@/lib/vendors";
import { listPriceOrDefault } from "@/lib/seed";
import { emitEvent, ensureSeeded } from "@/lib/poolView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateOrderInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Idempotency: same key => same order, never a second one.
  const existing = findOrderByIdempotencyKey(input.idempotencyKey);
  if (existing) return NextResponse.json(existing, { status: 200 });

  if (input.preferredVendorId && !VENDORS.some((v) => v.id === input.preferredVendorId)) {
    return NextResponse.json({ error: `Unknown vendor: ${input.preferredVendorId}` }, { status: 400 });
  }

  ensureSeeded(); // first touch of an empty DB loads the simulated startups
  const pool = getOrCreatePool();
  const t = now();
  const list = listPriceOrDefault(input.category, input.preferredVendorId);
  const order: Order = {
    id: newId("ord"),
    idempotencyKey: input.idempotencyKey,
    buyerName: input.buyerName.trim(),
    isSimulated: false,
    category: input.category,
    seats: input.seats,
    maxPricePerSeatCents: input.maxPricePerSeatCents,
    preferredVendorId: input.preferredVendorId,
    lat: input.lat,
    lng: input.lng,
    city: input.city,
    deadline: input.deadline ?? new Date(new Date(pool.windowClosesAt).getTime() + 7 * 24 * 3600_000).toISOString(),
    holdAmountCents: input.seats * Math.min(list, input.maxPricePerSeatCents ?? list),
    status: "held",
    finalPricePerSeatCents: null,
    redemptionLink: null,
    poolId: null,
    createdAt: t.toISOString(),
    updatedAt: t.toISOString(),
  };
  try {
    put("orders", order);
  } catch (err) {
    // Lost a race on the unique idempotency index: return the winner.
    const winner = findOrderByIdempotencyKey(input.idempotencyKey);
    if (winner) return NextResponse.json(winner, { status: 200 });
    throw err;
  }
  recomputePool();

  const at = t.toISOString();
  emitEvent({ type: "order_placed", orderId: order.id, category: order.category, seats: order.seats, at });
  if (order.maxPricePerSeatCents != null) {
    emitEvent({ type: "max_price_stated", orderId: order.id, category: order.category, seats: order.seats, priceCents: order.maxPricePerSeatCents, at });
  }
  void maybeAutoDispatch(); // marketplace starts vendor negotiation on its own once the pool is big enough
  return NextResponse.json(get("orders", order.id) ?? order, { status: 201 });
}
