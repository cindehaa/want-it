// GET /api/vendors/personas -> each test vendor's PRIVATE pricing policy, for the UI panel
// "Vendor's private pricing policy (hidden from our buyer agent)". The buyer agent's prompt never includes this.
import { NextResponse } from "next/server";
import { PERSONAS, publicPersonaView, vendorMode } from "@/lib/dial/vendorPersonas";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ vendorMode: vendorMode(), personas: PERSONAS.map(publicPersonaView) });
}
