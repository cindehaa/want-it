// GET /api/calls/:id -> { call, quote }
// Live calls: polls Dial, then (once a transcript exists) runs quote extraction exactly once.
// Replay calls: runs real extraction over the recorded transcript. Idempotent: an extracted call is never re-extracted.
// `?retry=1` re-attempts extraction for a call whose previous extraction failed (transcript kept).
import { NextResponse } from "next/server";
import { refreshCall } from "@/lib/dial/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const r = await refreshCall(id, { retryExtraction: url.searchParams.get("retry") === "1" });
  if (!r.call) return NextResponse.json({ error: `Call ${id} not found` }, { status: 404 });
  return NextResponse.json({ call: r.call, quote: r.quote, ...(r.pollError ? { pollError: r.pollError } : {}) });
}
