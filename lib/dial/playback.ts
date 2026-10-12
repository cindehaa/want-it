import { Call, Quote } from "@/lib/contracts";
import { RecordedCall } from "./recorded";
import { NEGOTIATION_ORDER } from "@/lib/vendors";

/** The bundled audio files correspond to these recordings, never to a newer live call. */
export function recordedPlayback(entries: unknown): Call[] {
  const parsed = RecordedCall.array().parse(entries);
  return NEGOTIATION_ORDER.flatMap((vendorId, index) => {
    const entry = parsed.find((r) => r.vendorId === vendorId);
    if (!entry) return [];
    return [Call.parse({
      ...entry,
      id: `recording_${entry.dialCallId ?? vendorId}`,
      poolId: "pool_soc2",
      sequence: entry.sequence ?? index + 1,
      vendorDialCallId: null,
      audio: { liveUrl: null, liveKind: null, recordingUrl: `/recordings/${vendorId}.m4a`, expiresAt: null },
      status: "transcribed",
      source: "recorded_replay",
      error: null,
      startedAt: entry.recordedAt,
      endedAt: entry.recordedAt,
    })];
  });
}


/** Refuse mismatched or ungrounded bundled offers before serving them to the browser. */
export function recordedQuotes(entries: unknown, calls: Call[]): Quote[] {
  const quotes = Quote.array().parse(entries);
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
  for (const quote of quotes) {
    const call = calls.find((item) => item.id === quote.callId && item.vendorId === quote.vendorId);
    const transcript = normalize(call?.transcriptTurns.map((turn) => turn.text).join(" ") ?? "");
    if (!call || !quote.evidence || !quote.evidence.split(" ... ").every((part) => transcript.includes(normalize(part)))) {
      throw new Error(`Saved quote evidence does not match its recording: ${quote.vendorId}`);
    }
  }
  return quotes;
}
