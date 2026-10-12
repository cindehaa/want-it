import { NextResponse } from "next/server";
import recordings from "@/data/recorded-calls.json";
import quotes from "@/data/recorded-quotes.json";
import { recordedPlayback, recordedQuotes } from "@/lib/dial/playback";

export const runtime = "nodejs";
export const dynamic = "force-static";

// Playback survives cold starts and never starts a call or quote-extraction request.
export function GET() {
  const calls = recordedPlayback(recordings);
  return NextResponse.json({ calls, quotes: recordedQuotes(quotes, calls) });
}
