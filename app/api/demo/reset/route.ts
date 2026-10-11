import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/clock";
import { seedDemo } from "@/lib/seed";
import { buildPoolView } from "@/lib/poolView";
import { negotiationInProgress } from "@/lib/dial/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "Demo controls are disabled" }, { status: 403 });
  if (negotiationInProgress()) {
    return NextResponse.json({ error: "Negotiation is still in progress. Stop the run and wait for the current call and extraction to finish before resetting." }, { status: 409 });
  }
  seedDemo();
  return NextResponse.json(await buildPoolView());
}
