import { NextResponse } from "next/server";
import { buildPoolView, ensureSeeded } from "@/lib/poolView";
import { refreshActiveCalls } from "@/lib/dial/refresh";
import { tickAutoRun } from "@/lib/autoDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded(); // zero orders => load the simulated demo startups
  await tickAutoRun();
  await refreshActiveCalls({ waitMs: 1200 }); // advance Dial polling + quote extraction (no webhooks on localhost)
  return NextResponse.json(await buildPoolView());
}
