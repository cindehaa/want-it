"use client";

import { useEffect, useState } from "react";
import type { PoolView } from "@/lib/contracts";

export type PoolViewState = { view: PoolView | null; failed: boolean };

/** Fetches GET /api/pool once on mount and every `intervalMs`. Keeps the last good view when a poll fails. */
export function usePoolView(intervalMs = 5000): PoolViewState {
  const [state, setState] = useState<PoolViewState>({ view: null, failed: false });
  useEffect(() => {
    let stop = false;
    let busy = false;
    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/pool", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const view = (await res.json()) as PoolView;
        if (!stop) setState({ view, failed: false });
      } catch {
        if (!stop) setState((s) => (s.view ? s : { view: null, failed: true }));
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
  return state;
}
