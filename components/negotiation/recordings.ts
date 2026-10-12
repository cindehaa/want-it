import { Call, Quote } from "@/lib/contracts";
import type { PoolView } from "@/lib/contracts";

/** Saved calls are display-only history; current pool calls and quotes take priority. */
export function withSavedRecordings(view: PoolView, payload: unknown): PoolView {
  const parsed = Call.array().safeParse((payload as { calls?: unknown } | null)?.calls);
  if (!parsed.success) return view;
  const currentVendors = new Set(view.calls.map((call) => call.vendorId));
  const knownVendors = new Set(view.vendors.map((vendor) => vendor.id));
  const saved = parsed.data.filter((call) => {
    if (currentVendors.has(call.vendorId) || !knownVendors.has(call.vendorId)) return false;
    if (call.source !== "recorded_replay" || !call.audio.recordingUrl || call.transcriptTurns.length === 0) return false;
    currentVendors.add(call.vendorId);
    return true;
  });
  if (saved.length === 0) return view;
  // These transcripts are complete. There is no extraction running for the current pool.
  const parsedQuotes = Quote.array().safeParse((payload as { quotes?: unknown } | null)?.quotes);
  const savedQuotes = parsedQuotes.success ? parsedQuotes.data.filter((quote) =>
    saved.some((call) => call.id === quote.callId && call.vendorId === quote.vendorId) &&
    !view.quotes.some((current) => current.callId === quote.callId || current.id === quote.id),
  ) : [];
  return {
    ...view,
    calls: [...view.calls, ...saved.map((call) => ({ ...call, status: "extracted" as const }))],
    quotes: savedQuotes.length ? [...view.quotes, ...savedQuotes] : view.quotes,
  };
}
