import { NextResponse } from "next/server";
import { get, put } from "@/lib/db";
import { now } from "@/lib/clock";
import { recomputePool } from "@/lib/pool";
import { emitEvent } from "@/lib/poolView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCELLABLE = ["held", "pooled", "negotiating"];

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = get("orders", id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!CANCELLABLE.includes(order.status)) {
    return NextResponse.json(
      { error: `Order can no longer be canceled (status: ${order.status}). Cancellation is only possible before the pool settles.` },
      { status: 409 },
    );
  }
  const at = now().toISOString();
  const updated = put("orders", { ...order, status: "canceled_by_buyer", updatedAt: at });
  recomputePool();
  emitEvent({ type: "order_canceled", orderId: order.id, category: order.category, seats: order.seats, at });
  return NextResponse.json(updated, { status: 200 });
}
