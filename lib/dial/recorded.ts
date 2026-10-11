// data/recorded-calls.json: REAL completed live calls saved so they can be replayed (labeled recorded_replay)
// if a live call fails during the demo. Nothing in here is ever synthesized.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Call } from "@/lib/contracts";

export const RecordedCall = z.object({
  vendorId: z.string(),
  recordedAt: z.string(), // = the live call's endedAt
  dialCallId: z.string().nullable(),
  instruction: z.string(),
  transcriptTurns: Call.shape.transcriptTurns,
  sequence: z.number().int().optional(), // which round it was recorded as (1 = Certly, 2 = Vantly, 3 = Certly callback)
});
export type RecordedCall = z.infer<typeof RecordedCall>;

const FILE = () => path.join(process.cwd(), "data", "recorded-calls.json");

export function loadRecorded(): RecordedCall[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r) => {
      const p = RecordedCall.safeParse(r);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  }
}

export function saveRecorded(entries: RecordedCall[]) {
  const file = FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Add (or replace, keyed by dialCallId) one recording. */
export function addRecorded(entry: RecordedCall): RecordedCall[] {
  const all = loadRecorded().filter((e) => !(entry.dialCallId && e.dialCallId === entry.dialCallId));
  all.push(entry);
  saveRecorded(all);
  return all;
}

/** Pick the recording to replay: prefer one not yet used in this pool, and one recorded for this round. */
export function pickRecording(vendorId: string, sequence: number, usedDialCallIds: Set<string>): RecordedCall | null {
  const forVendor = loadRecorded().filter((e) => e.vendorId === vendorId);
  if (forVendor.length === 0) return null;
  const unused = forVendor.filter((e) => !e.dialCallId || !usedDialCallIds.has(e.dialCallId));
  const pool = unused.length > 0 ? unused : forVendor;
  return pool.find((e) => e.sequence === sequence) ?? pool.find((e) => e.sequence == null) ?? pool[0];
}
