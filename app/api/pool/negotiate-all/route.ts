// Auto-run the whole negotiation round over all test vendors, one call at a time.
//   POST   { mode: 'live' | 'replay' }  start a run (idempotent while running) and place the first call
//   GET                                 run state + per-vendor progress; also advances the run (tickRunner). Poll every ~2s.
//   DELETE                              stop starting new calls (an in-flight call is left to finish)
// Response (all three): { run: {running, mode, order, startedAt, finishedAt, error, extractionRetried} | null,
//   progress: { total, completed, currentVendorId, vendors: [{vendorId, name, state, callId, callStatus, source, error, quote}], best } }
// vendor state: pending | active | done | no_quote | failed | no_recording   (replay never fabricates a missing recording)
import { NextResponse } from "next/server";
import { z } from "zod";
import { runView, startRun, stopRun, tickRunner } from "@/lib/dial/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ mode: z.enum(["live", "replay"]) });

export async function POST(req: Request) {
  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* handled below */ }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Body must be { mode: 'live' | 'replay' }" }, { status: 400 });
  try {
    const r = await startRun(parsed.data.mode);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: `Could not start the negotiation run: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

export async function GET() {
  try {
    await tickRunner();
    return NextResponse.json(runView());
  } catch (e) {
    return NextResponse.json({ error: `Could not read the negotiation run: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

export async function DELETE() {
  const r = stopRun();
  return NextResponse.json(r.body, { status: r.status });
}
