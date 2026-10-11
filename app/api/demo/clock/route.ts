import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceClock, isDemoMode } from "@/lib/clock";
import { buildPoolView } from "@/lib/poolView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ advanceHours: z.number().finite().min(-24 * 365).max(24 * 365) });

export async function POST(req: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: "Demo controls are disabled" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be {advanceHours:number}" }, { status: 400 });
  advanceClock(parsed.data.advanceHours);
  return NextResponse.json(await buildPoolView());
}
