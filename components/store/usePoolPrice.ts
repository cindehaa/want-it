"use client";

import { useEffect, useState } from "react";
import type { PoolView } from "@/lib/contracts";
import { bestGroupPrice } from "@/components/pool/pricing";

export type LivePool = {
  /** Best supplier-stated effective price per seat right now, or null when no quote exists yet. */
  groupCents: number | null;
  /** Number of orders currently pooled. */
  pooled: number;
  /** False until the first poll returns. */
  loaded: boolean;
};

export const bestGroupCents = bestGroupPrice;

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
