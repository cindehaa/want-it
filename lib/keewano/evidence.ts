import { z } from "zod";
import type { Category, DemandEvidence } from "../contracts";
import { KeewanoMcp, oneRow, sqlTool } from "./mcp";

export function demandQueries(category: Category): [string, string] {
  const where = `FROM events WHERE wantit_category = '${category}' AND event_datetime >= now() - INTERVAL '90 days' AND event_datetime <= now()`;
  return [
    `SELECT count(DISTINCT user_id) FILTER (WHERE wantit_interest = true) AS interested_buyers, count(DISTINCT user_id) FILTER (WHERE wantit_abandoned_price > 0) AS abandoned_buyers, count(DISTINCT user_id) FILTER (WHERE wantit_synthetic = true) AS synthetic_buyers ${where}`,
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wantit_max_price) AS median_max_price ${where}`,
  ];
}

const Count = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().int().nonnegative().safe());
const Price = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().nonnegative().finite());

export function evidenceFromRows(counts: unknown, price: unknown, queryText: string, ranAt: string): DemandEvidence {
  const row = z.object({ interested_buyers: Count, abandoned_buyers: Count, synthetic_buyers: Count }).parse(oneRow(counts));
  const median = z.object({ median_max_price: Price.nullable() }).parse(oneRow(price)).median_max_price;
  if (row.abandoned_buyers > row.interested_buyers) throw new Error("Abandoned buyers exceed interested buyers");
  return {
    source: "keewano_live", queryText, ranAt,
    interestedBuyers90d: row.interested_buyers, abandonedOverPrice90d: row.abandoned_buyers,
    medianMaxPricePerSeatCents: median === null ? null : Math.round(median),
    isSyntheticHistory: row.synthetic_buyers > 0,
    summary: `${row.interested_buyers} distinct interested buyers and ${row.abandoned_buyers} distinct buyers who left over price in 90 days. ${row.synthetic_buyers > 0 ? `Includes ${row.synthetic_buyers} synthetic buyers; this is demo history, not market validation.` : "Recorded application demand."} Median is Keewano's estimated percentile across stated maximum-price events.`,
  };
}

export async function queryEvidence(category: Category, token: string, signal: AbortSignal): Promise<DemandEvidence> {
  const client = new KeewanoMcp(token, signal);
  try {
    await client.connect();
    const tool = sqlTool(await client.tools(), process.env.KEEWANO_PROJECT_ID?.trim());
    const queries = demandQueries(category);
    const counts = await client.call(tool.name, tool.args(queries[0]));
    const median = await client.call(tool.name, tool.args(queries[1]));
    return evidenceFromRows(counts, median, queries.join(";\n\n"), new Date().toISOString());
  } finally { void client.close(); }
}
