import { Call } from "@/lib/contracts";
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
