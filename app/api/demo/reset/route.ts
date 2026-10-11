import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/clock";
import { seedDemo } from "@/lib/seed";
import { buildPoolView } from "@/lib/poolView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "Demo controls are disabled" }, { status: 403 });
  seedDemo();
  return NextResponse.json(await buildPoolView());
}
