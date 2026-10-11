// POST /api/pool/negotiate  body: { mode?: 'live' | 'replay', vendorId?: string }
// Single step: starts ONE call, to the next vendor not yet called in the fixed round
// [certly, vantly, trustwise, auditly, complykit] (or to the given vendorId). Returns the Call (201).
// Vendors that already have a quote are skipped; a failed call without a transcript can be retried.
//   live   -> Dial outbound call (buyer agent A -> vendor). VENDOR_MODE=ai (default): a Dial AI agent answers on
//             vendor number B with the vendor persona (set via PATCH /numbers/{id}); VENDOR_MODE=human: dials <VENDORID>_PHONE.
//   replay -> a previously RECORDED real call from data/recorded-calls.json, stored as source 'recorded_replay'.
// Each live call's instruction cites the best EFFECTIVE quote so far (see lib/dial/prompt.ts).
// For the whole round at once see POST /api/pool/negotiate-all.
import { NextResponse } from "next/server";
import { z } from "zod";
import { negotiateOnce } from "@/lib/dial/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ mode: z.enum(["live", "replay"]).optional(), vendorId: z.string().min(1).optional() });

export async function POST(req: Request) {
  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* empty body is fine */ }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Body must be { mode?: 'live' | 'replay', vendorId?: string }" }, { status: 400 });

  const r = await negotiateOnce({ mode: parsed.data.mode ?? "live", vendorId: parsed.data.vendorId });
  return NextResponse.json(r.body, { status: r.status });
}
