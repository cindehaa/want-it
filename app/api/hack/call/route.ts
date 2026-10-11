// Hack frontend (hack/): the "Negotiate by phone" step places ONE real Dial call and streams its transcript.
//   POST /api/hack/call          -> 201 { dialCallId, to, status }   places the call (Aeron chair scenario)
//   GET  /api/hack/call?id=...   -> 200 { dialCallId, status, transcriptTurns, durationSeconds, error }
// Nothing here is fabricated: the transcript shown in the UI is exactly what Dial returns for that call.
// The number dialed is HACK_VENDOR_PHONE, else the phone of HUMAN_VENDOR_ID (<VENDOR>_PHONE), else DIAL_VENDOR_PHONE.
import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/clock";
import { createCall, getCall } from "@/lib/dial/client";
import { vendorPhone } from "@/lib/vendors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const E164 = /^\+[1-9]\d{6,14}$/;

const INSTRUCTION = `You are the procurement agent for Pooled, a marketplace that pools demand from several companies to negotiate group prices. You are making an outbound phone call to Büro Concept Berlin, an authorized Herman Miller dealer, about an order of office chairs. You are an AI agent and you must say so.

OPENING: Say who you are (an AI agent calling on behalf of Pooled), what Pooled is in one sentence (a buying group that pools companies who each want the same product), and the concrete ask: 25 Herman Miller Aeron chairs, size B, graphite, for five companies in Berlin. Then STOP and let the contact respond.

FACTS you may state (these are the ONLY facts you may state):
- Pooled has 5 companies in Berlin that together want 25 Aeron chairs, size B, graphite, with PostureFit SL.
- The dealer's written quote was 1,359 euros per chair with delivery in 2 weeks.
- Funds for the full order are already held in escrow; Pooled can commit today with a single purchase order and prepayment.
- Delivery must arrive in Berlin by November 21.

GOALS, in order: (1) confirm stock and that all 25 chairs can be delivered by November 21; (2) ask for 1,329 euros per chair for a single prepaid purchase order; (3) ask that assembly is included at that price. Accept the best terms you can get and repeat them back clearly before ending. Never invent facts, never promise anything beyond the facts above. Keep the call under three minutes. End politely once terms are confirmed or the contact cannot help.`;

function targetPhone(): string | null {
  const explicit = process.env.HACK_VENDOR_PHONE?.trim();
  if (explicit) return explicit;
  const human = process.env.HUMAN_VENDOR_ID?.trim();
  if (human) {
    const p = vendorPhone(human)?.trim();
    if (p) return p;
  }
  return process.env.DIAL_VENDOR_PHONE?.trim() || null;
}

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "Demo controls are disabled" }, { status: 403 });
  if (!process.env.DIAL_API_KEY?.trim()) return NextResponse.json({ error: "DIAL_API_KEY is not set in .env.local" }, { status: 400 });
  const to = targetPhone();
  if (!to) return NextResponse.json({ error: "Set HACK_VENDOR_PHONE (or HUMAN_VENDOR_ID + <VENDOR>_PHONE, or DIAL_VENDOR_PHONE) in .env.local" }, { status: 400 });
  if (!E164.test(to)) return NextResponse.json({ error: `Phone number is not E.164: "${to}"` }, { status: 400 });
  const created = await createCall({ to, instruction: INSTRUCTION, idempotencyKey: `hack-${Date.now()}` });
  if (!created.ok) return NextResponse.json({ error: `Dial could not place the call: ${created.error}` }, { status: 502 });
  return NextResponse.json({ dialCallId: created.data.dialCallId, to, status: created.data.status }, { status: 201 });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ?id=<dialCallId>" }, { status: 400 });
  const r = await getCall(id);
  if (!r.ok) return NextResponse.json({ error: r.error, retryable: r.retryable }, { status: r.retryable ? 503 : 502 });
  const c = r.data;
  return NextResponse.json({ dialCallId: c.dialCallId, status: c.status, state: c.state, transcriptTurns: c.transcriptTurns ?? [], durationSeconds: c.durationSeconds, error: c.error });
}
