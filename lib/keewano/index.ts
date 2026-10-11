import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Category, DemandEvidence, type DemandEvent } from "../contracts";
import { demandBatch } from "./events";
import { queryEvidence } from "./evidence";
import { sendBatch } from "./ingest";

const inFlight = new Map<string, Promise<DemandEvidence>>();
const TIMEOUT_MS = 8000;

function cacheFile(category: Category, token: string): string {
  // Cache identity follows the account token and explicit project, never another demo's evidence.
  const identity = createHash("sha256").update(`${token}:${process.env.KEEWANO_PROJECT_ID ?? ""}`).digest("hex").slice(0, 24);
  return path.join(process.cwd(), "data", "keewano-cache", `${identity}-${category}.json`);
}

function unavailable(reason: string): DemandEvidence {
  return { source: "unavailable", queryText: "", ranAt: null, interestedBuyers90d: null,
    abandonedOverPrice90d: null, medianMaxPricePerSeatCents: null, isSyntheticHistory: true,
    summary: reason };
}

/** Analytics failure must not interrupt checkout or cancellation. */
export async function recordEvent(input: DemandEvent): Promise<void> {
  try {
    const key = process.env.KEEWANO_EVENT_KEY?.trim();
    if (!key) return;
    const batch = demandBatch(input);
    const ack = await sendBatch(batch, key, AbortSignal.timeout(TIMEOUT_MS));
    if (ack.accepted === 0) console.warn("Keewano event batch accepted zero events; it may already exist or was rejected");
  } catch {
    // Keep upstream errors out of buyer responses and do not log credentials or raw bodies.
    console.warn("Keewano demand event was not confirmed; checkout continues");
  }
}

async function loadEvidence(category: Category, token: string): Promise<DemandEvidence> {
  const file = cacheFile(category, token);
  try {
    const live = await queryEvidence(category, token, AbortSignal.timeout(TIMEOUT_MS));
    try {
      await mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(live), { mode: 0o600 });
      await rename(temporary, file);
    } catch { /* A cache write failure must not hide a valid live result. */ }
    return live;
  } catch (error) {
    let reason = error instanceof Error ? error.message : "Keewano query failed";
    if (/abort|timeout/i.test(reason)) reason = "Keewano query exceeded the 8-second deadline";
    // Only our bounded diagnostic messages reach the API response, never upstream bodies.
    if (!reason.startsWith("Keewano") && !reason.startsWith("Abandoned")) reason = "Keewano returned an invalid demand result";
    try {
      const cached = DemandEvidence.parse(JSON.parse(await readFile(file, "utf8")));
      if (cached.source === "unavailable" || !cached.ranAt || !Number.isFinite(Date.parse(cached.ranAt)) || Date.parse(cached.ranAt) > Date.now()) throw new Error("Invalid cached evidence");
      return { ...cached, source: "keewano_cached", summary: `${cached.summary} Cached from ${cached.ranAt}. ${reason}.` };
    } catch { return unavailable(reason); }
  }
}

/** A concurrent pool poll shares the pending query, but later polls run a fresh query. */
export async function getDemandEvidence(category: Category): Promise<DemandEvidence> {
  try {
    const parsed = Category.parse(category);
    const token = process.env.KEEWANO_PAT?.trim();
    if (!token) return unavailable("KEEWANO_PAT is missing; demand evidence is unavailable");
    const key = cacheFile(parsed, token);
    const pending = inFlight.get(key);
    if (pending) return await pending;
    const task = loadEvidence(parsed, token);
    inFlight.set(key, task);
    try { return await task; } finally { inFlight.delete(key); }
  } catch { return unavailable("Keewano demand evidence is unavailable"); }
}
