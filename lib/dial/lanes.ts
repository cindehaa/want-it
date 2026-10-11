// Parallel live mode: one Dial "lane" per vendor, each with its OWN vendor number (the AI vendor persona answers
// there) and its OWN caller number, because a Dial number handles one call at a time. Configured via env:
//
//   DIAL_PARALLEL_LANES='[{"vendorId":"certly","vendorNumberId":"num_...","vendorPhone":"+14155550101","callerNumberId":"num_..."}, ...]'
//
// Needs >= 2 lanes. Every lane must use a distinct vendor number and a distinct caller number.
import { NEGOTIATION_ORDER, VENDORS } from "@/lib/vendors";

export type LaneConfig = {
  vendorId: string;
  vendorNumberId: string; // Dial number whose inboundInstruction gets the vendor persona
  vendorPhone: string; // E.164 of that vendor number (the buyer agent dials it)
  callerNumberId: string; // Dial number the buyer agent calls FROM
};

export const PARALLEL_LANES_ENV = "DIAL_PARALLEL_LANES";
export const PARALLEL_NEEDS_LANES_ERROR = "Parallel mode needs DIAL_PARALLEL_LANES (one vendor number + caller number per vendor)";

const E164 = /^\+[1-9]\d{6,14}$/;

export type LanesParse = { lanes: LaneConfig[]; error: string | null };

export function parseParallelLanes(raw: string | undefined = process.env[PARALLEL_LANES_ENV]): LanesParse {
  if (!raw || !raw.trim()) return { lanes: [], error: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { lanes: [], error: `${PARALLEL_LANES_ENV} is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(json)) return { lanes: [], error: `${PARALLEL_LANES_ENV} must be a JSON array of lanes` };
  const known = new Set(VENDORS.map((v) => v.id));
  const lanes: LaneConfig[] = [];
  for (const [i, item] of json.entries()) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
    const lane: LaneConfig = { vendorId: str("vendorId"), vendorNumberId: str("vendorNumberId"), vendorPhone: str("vendorPhone"), callerNumberId: str("callerNumberId") };
    for (const k of ["vendorId", "vendorNumberId", "vendorPhone", "callerNumberId"] as const) {
      if (!lane[k]) return { lanes: [], error: `${PARALLEL_LANES_ENV}[${i}] is missing "${k}"` };
    }
    if (!known.has(lane.vendorId)) return { lanes: [], error: `${PARALLEL_LANES_ENV}[${i}]: unknown vendorId "${lane.vendorId}". Known: ${[...known].join(", ")}` };
    if (!E164.test(lane.vendorPhone)) return { lanes: [], error: `${PARALLEL_LANES_ENV}[${i}]: vendorPhone is not E.164 (e.g. +14155550123): "${lane.vendorPhone}"` };
    lanes.push(lane);
  }
  for (const k of ["vendorId", "vendorNumberId", "callerNumberId"] as const) {
    const vals = lanes.map((l) => l[k]);
    const dup = vals.find((v, i) => vals.indexOf(v) !== i);
    if (dup) return { lanes: [], error: `${PARALLEL_LANES_ENV}: "${dup}" is used by more than one lane; each lane needs its own ${k} (a Dial number handles one call at a time)` };
  }
  const allNumbers = lanes.flatMap((lane) => [lane.vendorNumberId, lane.callerNumberId]);
  if (new Set(allNumbers).size !== allNumbers.length) return { lanes: [], error: `${PARALLEL_LANES_ENV}: caller and vendor numbers must be distinct across all lanes` };
  if (new Set(lanes.map((lane) => lane.vendorPhone)).size !== lanes.length) return { lanes: [], error: `${PARALLEL_LANES_ENV}: each vendor needs a distinct phone number` };
  return { lanes, error: null };
}

/** Configured lanes in the app's negotiation order (empty when unset or invalid). */
export function parallelLanes(): LaneConfig[] {
  const { lanes } = parseParallelLanes();
  const order: readonly string[] = NEGOTIATION_ORDER;
  return [...lanes].sort((a, b) => order.indexOf(a.vendorId) - order.indexOf(b.vendorId));
}

/** Parallel mode is available when >= 2 valid lanes are configured. */
export const parallelAvailable = (): boolean => parallelLanes().length >= 2;
