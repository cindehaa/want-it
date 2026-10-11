// Auto-run the whole negotiation round over all test vendors.
//   POST   { mode: 'live' | 'replay', parallel?: boolean, round2?: boolean }
//            start a run (idempotent while running) and place the first call(s).
//            Live defaults to concurrent configured lanes. Pass parallel:false for sequential live calls. { mode:'live', parallel:true }: every vendor lane dials AT ONCE
//            (round 1), then the top 2 vendors are called back citing the best competing offer (round 2; skip with
//            round2:false). Parallel needs env DIAL_PARALLEL_LANES, else 400.
//   GET                                 run state + per-vendor progress; also advances the run (tickRunner). Poll every ~2s.
//   DELETE                              stop starting new calls (an in-flight call is left to finish)
// Response (all three): { run: {running, mode, order, startedAt, finishedAt, error, parallel, round, ...} | null, parallelAvailable,
//   progress: { total, completed, currentVendorId, vendors: [{vendorId, name, state, callId, callStatus, source, error, round, quote}], best } }
// vendor state: pending | active | done | no_quote | failed | no_recording   (replay never fabricates a missing recording)
import { NextResponse } from "next/server";
import { z } from "zod";
import { runView, startRun, stopRun, tickRunner } from "@/lib/dial/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ mode: z.enum(["live", "replay"]), parallel: z.boolean().optional(), round2: z.boolean().optional() });

export async function POST(req: Request) {
  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* handled below */ }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Body must be { mode: 'live' | 'replay', parallel?: boolean, round2?: boolean }" }, { status: 400 });
  try {
    const r = await startRun(parsed.data.mode, { parallel: parsed.data.parallel, round2: parsed.data.round2 });
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
