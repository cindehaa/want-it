import type { Call } from "@/lib/contracts";

export function callMinutes(call: Call, realNow: Date = new Date()): number {
  const transcript = call.transcriptTurns.reduce((last, t) => Math.max(last, t.startMs), 0) / 60000;
  // Replay startedAt is the replay time; endedAt belongs to the original call.
  if (call.source === "recorded_replay") return Math.max(0, transcript);
  const end = call.endedAt ? new Date(call.endedAt).getTime() : realNow.getTime();
  const wall = (end - new Date(call.startedAt).getTime()) / 60000;
  return Math.max(0, transcript, Number.isFinite(wall) ? wall : 0);
}
