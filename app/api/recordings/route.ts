import { NextResponse } from "next/server";
import recordings from "@/data/recorded-calls.json";
import { recordedPlayback } from "@/lib/dial/playback";

export const runtime = "nodejs";
export const dynamic = "force-static";

// Playback survives cold starts and never starts a call or quote-extraction request.
export function GET() {
  return NextResponse.json({ calls: recordedPlayback(recordings) });
}
