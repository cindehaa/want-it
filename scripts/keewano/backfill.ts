import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EVENTS_HASH, EVENT_TYPES, syntheticBatches } from "../../lib/keewano/events";
import { sendBatch } from "../../lib/keewano/ingest";
import { loadEnv } from "./env";

const Receipt = z.object({
  version: z.literal(1), anchorSeconds: z.number().int().positive(),
  confirmed: z.array(z.string()), pending: z.string().nullable(), accountFingerprint: z.string().nullable(),
});

async function main() {
  loadEnv();
  const dryRun = !process.argv.includes("--send");
  const file = path.join(process.cwd(), "data", "keewano-backfill-receipt.json");
  let receipt: z.infer<typeof Receipt>;
  try { receipt = Receipt.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Invalid backfill receipt; inspect it before sending anything");
    receipt = { version: 1, anchorSeconds: Math.floor(Date.now() / 1000), confirmed: [], pending: null, accountFingerprint: null };
  }
  const batches = syntheticBatches(receipt.anchorSeconds);
  console.log(JSON.stringify({ mode: dryRun ? "dry_run" : "send", synthetic: true, buyers: batches.length,
    expectedInterestedBuyers: 60, expectedAbandonedBuyers: 21, events: batches.reduce((n, b) => n + b.events.length, 0),
    customEventsHash: EVENTS_HASH, eventTypes: EVENT_TYPES, alreadyConfirmed: receipt.confirmed.length,
    pending: receipt.pending, firstBatch: batches[0] }, null, 2));
  if (dryRun) return;
  const key = process.env.KEEWANO_EVENT_KEY?.trim();
  if (!key) throw new Error("KEEWANO_EVENT_KEY is missing; no events sent");
  const fingerprint = createHash("sha256").update(key).digest("hex");
  if (receipt.accountFingerprint && receipt.accountFingerprint !== fingerprint) {
    throw new Error("Backfill receipt belongs to a different event key; preserve it and use a separate checkout for another project");
  }
  receipt.accountFingerprint = fingerprint;
  if (receipt.pending && !process.argv.includes("--retry-pending")) {
    throw new Error("A previous batch has an uncertain outcome. Inspect the receipt, then use --send --retry-pending to retry the SAME idempotent batch");
  }
  const save = async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  };
  for (const batch of batches) {
    if (receipt.confirmed.includes(batch.installId)) continue;
    const retry = receipt.pending === batch.installId;
    receipt.pending = batch.installId;
    await save();
    const ack = await sendBatch(batch, key, AbortSignal.timeout(8000));
    // Zero on an explicit uncertain retry may mean the stable batch was already accepted.
    if (ack.accepted === 0 && !retry) throw new Error("Zero events accepted. Inspect the project before retrying; no ingestion success is claimed");
    if (ack.accepted === 0) console.log(`${batch.installId}: duplicate or invalid batch, verify through live query`);
    else console.log(`${batch.installId}: ${ack.accepted} events accepted for processing`);
    receipt.confirmed.push(batch.installId); receipt.pending = null;
    await save();
  }
  console.log("Backfill requests acknowledged. Allow about five minutes, then run check.ts. This is not query verification.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Backfill failed"); process.exitCode = 1; });
