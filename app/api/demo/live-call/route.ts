// Demo: reset, load the recorded calls for every vendor except the human-answered one, then place ONE real
// Dial call to that vendor (HUMAN_VENDOR_ID, answered by a person on <VENDOR>_PHONE).
import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/clock";
import { seedDemo } from "@/lib/seed";
import { negotiateOnce } from "@/lib/dial/runner";
import { NEGOTIATION_ORDER } from "@/lib/vendors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "Demo controls are disabled" }, { status: 403 });
  const live = process.env.HUMAN_VENDOR_ID;
  if (!live) return NextResponse.json({ error: "Set HUMAN_VENDOR_ID (e.g. vantly) in .env.local" }, { status: 400 });
  seedDemo();
  for (const vendorId of NEGOTIATION_ORDER) {
    if (vendorId === live) continue;
    await negotiateOnce({ mode: "replay", vendorId });
  }
  const res = await negotiateOnce({ mode: "live", vendorId: live });
  return NextResponse.json(res.body, { status: res.status });
}
