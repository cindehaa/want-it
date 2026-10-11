// POST /api/calls/:id/record -> saves a COMPLETED LIVE call (real transcript) into data/recorded-calls.json
// so it can be replayed (labeled recorded_replay, with this recordedAt) if a live call fails during the demo.
import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { addRecorded } from "@/lib/dial/recorded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const call = get("calls", id);
  if (!call) return NextResponse.json({ error: `Call ${id} not found` }, { status: 404 });
  if (call.source !== "live") return NextResponse.json({ error: "Only live calls can be recorded (this one is already a replay)." }, { status: 400 });
  if (call.transcriptTurns.length === 0 || !["transcribed", "extracted"].includes(call.status)) {
    return NextResponse.json({ error: `Call is not complete with a transcript yet (status: ${call.status}).` }, { status: 409 });
  }
  const recordedAt = call.endedAt ?? call.startedAt;
  const all = addRecorded({ vendorId: call.vendorId, recordedAt, dialCallId: call.dialCallId, instruction: call.instruction, transcriptTurns: call.transcriptTurns, sequence: call.sequence });
  return NextResponse.json({ recorded: { vendorId: call.vendorId, recordedAt, dialCallId: call.dialCallId, turns: call.transcriptTurns.length, sequence: call.sequence }, totalRecordings: all.length });
}
