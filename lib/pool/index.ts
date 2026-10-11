// Deterministic pool membership (SPEC §4). No AI.
import type { Order, Pool } from "@/lib/contracts";
import { all, put, get } from "@/lib/db";
import { now } from "@/lib/clock";

export const POOL_ID = "pool_soc2";
export const POOL_CATEGORY = "soc2_compliance" as const;
export const WINDOW_HOURS = 72;

const ACTIVE: Order["status"][] = ["held", "pooled", "negotiating"];

export function getOrCreatePool(): Pool {
  const existing = get("pools", POOL_ID);
  if (existing) return existing;
  return put("pools", {
    id: POOL_ID,
    category: POOL_CATEGORY,
    windowClosesAt: new Date(now().getTime() + WINDOW_HOURS * 3600_000).toISOString(),
    status: "open",
    memberOrderIds: [],
    exclusions: [],
    totalSeats: 0,
  });
}

/** Recompute members/exclusions from current order state and persist. Counts each order once (latest doc). */
export function recomputePool(): Pool {
  const pool = getOrCreatePool();
  const orders = all("orders");
  const members: string[] = [];
  const exclusions: Pool["exclusions"] = [];
  let seats = 0;
  const open = pool.status === "open" || pool.status === "negotiating";
  for (const o of orders) {
    if (o.status === "canceled_by_buyer") { exclusions.push({ orderId: o.id, reason: "canceled" }); continue; }
    if (o.category !== pool.category) { exclusions.push({ orderId: o.id, reason: "wrong_category" }); continue; }
    if (new Date(o.deadline) < new Date(pool.windowClosesAt)) { exclusions.push({ orderId: o.id, reason: "deadline_before_window" }); continue; }
    if (open && !ACTIVE.includes(o.status)) continue;
    members.push(o.id);
    seats += o.seats;
    if (open && o.status === "held") {
      put("orders", { ...o, status: pool.status === "negotiating" ? "negotiating" : "pooled", poolId: pool.id, updatedAt: now().toISOString() });
    }
  }
  if (!open) return pool; // settled pools keep their final membership
  return put("pools", { ...pool, memberOrderIds: members, exclusions, totalSeats: seats });
}
