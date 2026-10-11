import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { getRecording } from "@/lib/dial/client";
import recordings from "@/data/recorded-calls.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bundled = recordings.find((r) => `recording_${r.dialCallId}` === id);
  if (bundled) return NextResponse.redirect(new URL(`/recordings/${bundled.vendorId}.m4a`, req.url));
  const call = get("calls", id);
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (["queued", "in_progress"].includes(call.status)) {
    return NextResponse.json({ error: "Live listen-in is unavailable. The recording can be played after the call ends." }, { status: 409 });
  }
  if (!call.dialCallId) return NextResponse.json({ error: "No recording is available for this call" }, { status: 404 });
  const range = req.headers.get("range") ?? undefined;
  if (range && !/^bytes=\d*-\d*$/.test(range)) return NextResponse.json({ error: "Use one byte range" }, { status: 416 });
  try {
    const upstream = await getRecording(call.dialCallId, range);
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const status = upstream.status === 404 ? 404 : upstream.status === 416 ? 416 : upstream.status === 503 ? 503 : 502;
      return NextResponse.json({ error: status === 404 ? "The recording is not ready or is unavailable" : "Could not fetch the call recording" }, { status });
    }
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type")?.startsWith("audio/") ? upstream.headers.get("content-type")! : "audio/wav",
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    for (const key of ["content-length", "content-range"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: "Could not fetch the call recording" }, { status: 502 });
  }
}
