// The marketplace — not the buyer — dispatches negotiation. When a pool has enough buyers and no
// negotiation has run yet, start the vendor-call run automatically. AUTO_NEGOTIATE: off | replay | live.
import { getOrCreatePool } from "@/lib/pool";
import { all } from "@/lib/db";
import { runView, startRun, tickRunner, type NegotiateMode } from "@/lib/dial/runner";

const mode = (): NegotiateMode | null => {
  const m = process.env.AUTO_NEGOTIATE;
  return m === "live" || m === "replay" ? m : null;
};
const minBuyers = () => Number(process.env.AUTO_NEGOTIATE_MIN_BUYERS ?? "10");

export async function maybeAutoDispatch(): Promise<void> {
  const m = mode();
  if (!m) return;
  try {
    const pool = getOrCreatePool();
    if (pool.status !== "open" || pool.memberOrderIds.length < minBuyers()) return;
    if (runView().startedAt) return; // a run already happened for this demo
    if (all("calls").some((c) => c.poolId === pool.id)) return;
    await startRun(m);
  } catch (err) {
    console.error("auto-dispatch failed", err);
  }
}

/** Keep an in-flight run moving from any polled endpoint (no webhooks on localhost). */
export async function tickAutoRun(): Promise<void> {
  try {
    if (runView().running) await tickRunner();
  } catch (err) {
    console.error("auto-run tick failed", err);
  }
}
