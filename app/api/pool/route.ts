import { NextResponse } from "next/server";
import { buildPoolView, ensureSeeded } from "@/lib/poolView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded(); // zero orders => load the simulated demo startups
  return NextResponse.json(await buildPoolView());
}
