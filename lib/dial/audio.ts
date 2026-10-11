import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Call } from "@/lib/contracts";
import { getRecording } from "@/lib/dial/client";

function signature(id: string, dialId: string, expires: string): string {
  return createHmac("sha256", process.env.DIAL_API_KEY ?? "").update(JSON.stringify([id, dialId, expires])).digest("hex");
}

// A different serverless instance may not have the SQLite row that created this link.
export function recordingLink(call: Call): { recordingUrl: string; expiresAt: string } {
  const expires = String(Math.floor(Date.now() / 1000) + 86400);
  const dialId = call.dialCallId!;
  const query = new URLSearchParams({ call: dialId, expires, signature: signature(call.id, dialId, expires) });
  return { recordingUrl: `/api/calls/${encodeURIComponent(call.id)}/audio?${query}`, expiresAt: new Date(Number(expires) * 1000).toISOString() };
}

export function verifiedRecordingId(id: string, url: URL): string | null {
  const dialId = url.searchParams.get("call");
  const expires = url.searchParams.get("expires");
  const supplied = url.searchParams.get("signature");
  if (!process.env.DIAL_API_KEY || !dialId || !expires || !supplied || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(supplied)) return null;
  const remaining = Number(expires) - Math.floor(Date.now() / 1000);
  if (remaining <= 0 || remaining > 86400) return null;
  const expected = signature(id, dialId, expires);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex")) ? dialId : null;
}

const saved = new Set<string>();
export async function saveFinishedRecording(call: Call): Promise<void> {
  // Vercel's deployed public directory is read-only; hosted playback uses the proxy.
  if (process.env.VERCEL || process.env.NODE_ENV === "test" || !call.dialCallId || saved.has(call.dialCallId)) return;
  if (!/^[a-z0-9_-]+$/.test(call.vendorId)) return;
  saved.add(call.dialCallId);
  try {
    const response = await getRecording(call.dialCallId);
    if (!response.ok) { await response.body?.cancel(); saved.delete(call.dialCallId); return; }
    const bytes = Buffer.from(await response.arrayBuffer());
    const format = bytes.subarray(0, 4).toString() === "RIFF" ? "wav" : bytes.subarray(4, 8).toString() === "ftyp" ? "m4a" : bytes.subarray(0, 3).toString() === "ID3" || bytes[0] === 255 ? "mp3" : null;
    if (!format) { saved.delete(call.dialCallId); return; }
    const folder = path.join(process.cwd(), "public", "recordings");
    await mkdir(folder, { recursive: true });
    const target = path.join(folder, `${call.vendorId}.${format}`);
    const temporary = `${target}.${Date.now()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  } catch {
    saved.delete(call.dialCallId);
  }
}
