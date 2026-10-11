// Builds the GET /api/pool response. Server-only.
import type { DemandEvent, PoolView } from "@/lib/contracts";
import { all } from "@/lib/db";
import { now, clockOffsetHours, isDemoMode } from "@/lib/clock";
import { recomputePool } from "@/lib/pool";
import { VENDORS } from "@/lib/vendors";
import { getDemandEvidence, recordEvent } from "@/lib/keewano";
import { computeTimeSaved } from "@/lib/timeSaved";
import { seedDemo } from "@/lib/seed";

/** Auto-seed the demo data the first time anything touches an empty database. */
export function ensureSeeded() {
  if (all("orders").length === 0) seedDemo();
}

/** Fire-and-forget Keewano event. Never throws, never awaited. */
export function emitEvent(event: DemandEvent) {
  try {
    void recordEvent(event).catch(() => {});
  } catch {
    /* analytics must never break checkout */
  }
}

export async function buildPoolView(): Promise<PoolView> {
  const pool = recomputePool();
  const orders = all("orders").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const calls = all("calls").filter((c) => c.poolId === pool.id);
  const callIds = new Set(calls.map((c) => c.id));
  const quotes = all("quotes").filter((q) => callIds.has(q.callId));
  const evidence = await getDemandEvidence(pool.category);
  const memberIds = new Set(pool.memberOrderIds);
  const members = orders.filter((o) => memberIds.has(o.id));
  return {
    now: now().toISOString(),
    clockOffsetHours: clockOffsetHours(),
    demoMode: isDemoMode(),
    pool,
    orders,
    vendors: VENDORS,
    calls,
    quotes,
    evidence,
    timeSaved: computeTimeSaved(members, calls),
  };
}
