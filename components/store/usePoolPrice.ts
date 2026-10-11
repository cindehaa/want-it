"use client";

import { useEffect, useState } from "react";
import type { Order, PoolView } from "@/lib/contracts";
import { effectivePrice } from "@/lib/settle";

export type LivePool = {
  /** Best supplier-stated effective price per seat right now, or null when no quote exists yet. */
  groupCents: number | null;
  /** Number of orders currently pooled. */
  pooled: number;
  /** False until the first poll returns. */
  loaded: boolean;
};

/**
 * Best current supplier-stated quote, using lib/settle effectivePrice semantics
 * (tier price at the vendor's pool size + per-account fee spread over a representative order).
 * Mirrors GET /api/orders/[id]: quotes that rule out separate accounts are skipped.
 */
export function bestGroupCents(view: PoolView): number | null {
  const { pool, orders, quotes } = view;
  const memberIds = new Set(pool.memberOrderIds);
  const members = orders.filter((o) => memberIds.has(o.id));
  if (quotes.length === 0 || members.length === 0) return null;
  const avgSeats = Math.max(1, Math.round(members.reduce((s, o) => s + o.seats, 0) / members.length));
  const ref = { seats: avgSeats } as Order;
  let best: number | null = null;
  for (const q of quotes) {
    if (q.separateAccountsConfirmed === false) continue;
    const poolSeats = members.filter((m) => !m.preferredVendorId || m.preferredVendorId === q.vendorId).reduce((s, m) => s + m.seats, 0);
    const p = effectivePrice(q, poolSeats, ref);
    if (p != null && (best == null || p < best)) best = p;
  }
  return best;
}

/** Polls GET /api/pool every `intervalMs` (default 3s). */
export function usePoolPrice(intervalMs = 3000): LivePool {
  const [live, setLive] = useState<LivePool>({ groupCents: null, pooled: 0, loaded: false });
  useEffect(() => {
    let stop = false;
    let busy = false;
    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/pool", { cache: "no-store" });
        if (!res.ok) return;
        const view = (await res.json()) as PoolView;
        if (stop) return;
        setLive({ groupCents: bestGroupCents(view), pooled: view.pool.memberOrderIds.length, loaded: true });
      } catch {
        /* keep last good values */
      } finally {
        busy = false;
      }
    }
    void tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [intervalMs]);
  return live;
}
