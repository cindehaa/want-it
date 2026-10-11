import { NextResponse } from "next/server";
import { buildPoolView, ensureSeeded } from "@/lib/poolView";
import { refreshActiveCalls } from "@/lib/dial/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded(); // zero orders => load the simulated demo startups
  await refreshActiveCalls({ waitMs: 1200 }); // advance Dial polling + quote extraction (no webhooks on localhost)
  return NextResponse.json(await buildPoolView());
}
