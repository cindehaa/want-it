// Keewano integration — OWNED BY TEAMMATE (see WIP/briefs/TEAMMATE.md). Signatures are fixed by Lead.
import type { DemandEvent, DemandEvidence, Category } from "@/lib/contracts";

/** Fire-and-forget analytical copy of a demand event. Must never throw into the caller. */
export async function recordEvent(_event: DemandEvent): Promise<void> {
  // stub: teammate implements ingest to Keewano
}

/** Live Keewano query over demand history. Falls back to cached, then unavailable. Never throws. */
export async function getDemandEvidence(_category: Category): Promise<DemandEvidence> {
  return {
    source: "unavailable",
    queryText: "",
    ranAt: null,
    interestedBuyers90d: null,
    abandonedOverPrice90d: null,
    medianMaxPricePerSeatCents: null,
    isSyntheticHistory: true,
    summary: "Keewano not connected yet.",
  };
}
