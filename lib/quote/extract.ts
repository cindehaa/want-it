// Transcript -> Quote. Claude reads the REAL call transcript and extracts only terms the VENDOR stated.
// Never fabricates: every quote carries verbatim transcript evidence (verified against the transcript here),
// and a call where the vendor stated no price returns null.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Quote, type Call } from "@/lib/contracts";
import { newId } from "@/lib/db";
import { now as appNow } from "@/lib/clock";

export const EXTRACTION_MODEL = "claude-sonnet-5-5";

// Model-facing schema: dollars (less error-prone than cents); we convert + validate below.
const Extraction = z.object({
  vendorStatedPrice: z.boolean().describe("true only if the VENDOR stated at least one per-seat price for the group"),
  tiers: z
    .array(
      z.object({
        minSeats: z.number().describe("minimum total seats at which this price applies; 1 if the vendor tied no minimum to it"),
        pricePerSeatDollars: z.number().describe("price per seat in US dollars as stated by the vendor"),
      }),
    )
    .describe("every per-seat price tier the vendor stated or explicitly confirmed"),
  perAccountFeeDollars: z.number().describe("fixed fee per buyer account (setup/onboarding/admin) in dollars; 0 if none or not mentioned"),
  separateAccountsConfirmed: z
    .boolean()
    .nullable()
    .describe("true if the vendor explicitly confirmed each buyer gets its own separate account; false if the vendor said accounts must be shared/combined; null if not discussed"),
  expiresInDays: z.number().nullable().describe("how many days from the call the offer is valid, if the vendor stated a duration; else null"),
  expiresOnDate: z.string().nullable().describe("ISO 8601 date/time if the vendor stated a calendar deadline, computed from the current date given; else null"),
  conditions: z.array(z.string()).describe("short conditions the vendor attached (e.g. 'first-year pricing only', 'annual prepay'); empty if none"),
  evidence: z.array(z.string()).describe("1-4 VERBATIM sentences copied exactly from the transcript where the vendor stated or confirmed the price/terms"),
});
type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `You extract a supplier's price quote from a phone-call transcript between a buyer-side AI procurement agent (want-it) and a software vendor's sales contact.

Rules:
- Extract ONLY terms the VENDOR stated, or terms the buyer agent restated and the vendor explicitly confirmed ("yes, that's right"). Never extract a price that only the buyer agent proposed, asked for, or cited from another vendor, unless the vendor agreed to it.
- Speaker labels come from automatic transcription and can be wrong. The buyer agent is the party that introduces itself as an AI procurement agent for want-it and asks for prices; the vendor is the party that quotes prices.
- If the vendor corrected or changed a number during the call, use their FINAL stated terms.
- Do not infer or compute prices that were not said. If the vendor stated no per-seat price (declined, deflected, no discount offered, call dropped), set vendorStatedPrice=false and return empty tiers.
- If the vendor only restated its list price with no group discount, that is still a stated price: include it as a tier.
- evidence must be copied VERBATIM from the transcript (exact words), only from lines where the vendor stated or confirmed the terms. Do not paraphrase.
- separateAccountsConfirmed: true only on an explicit vendor confirmation; false only if the vendor said buyers must share one account; otherwise null.
- Dollar amounts spoken as words ("twenty-four dollars") are numbers (24).`;

// ---------------------------------------------------------------------------------------------

const SPEAKER_LABEL: Record<string, string> = {
  agent: "WANT-IT AGENT (per transcription label)",
  user: "OTHER PARTY (per transcription label)",
  transfer_target: "OTHER PARTY, transferred contact (per transcription label)",
};

export function formatTranscript(call: Pick<Call, "transcriptTurns">): string {
  return call.transcriptTurns.map((t) => `${SPEAKER_LABEL[t.speaker] ?? t.speaker.toUpperCase()}: ${t.text}`).join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter(Boolean));

/** Keep only evidence that really is in the transcript. A near-miss snaps to the best-matching turn's full text. */
export function groundEvidence(snippets: string[], turns: Call["transcriptTurns"]): string[] {
  const full = norm(turns.map((t) => t.text).join(" "));
  const out: string[] = [];
  for (const raw of snippets) {
    const snip = raw.trim();
    if (!snip) continue;
    const n = norm(snip);
    if (n && full.includes(n)) { out.push(snip); continue; }
    const st = tokens(snip);
    let best: { text: string; score: number } | null = null;
    for (const t of turns) {
      const tt = tokens(t.text);
      let hit = 0;
      st.forEach((w) => { if (tt.has(w)) hit++; });
      const score = st.size ? hit / st.size : 0;
      if (!best || score > best.score) best = { text: t.text, score };
    }
    if (best && best.score >= 0.7) out.push(best.text.trim());
  }
  return [...new Set(out)];
}

function resolveExpiry(x: Extraction, base: Date): string | null {
  if (x.expiresOnDate) {
    const d = new Date(x.expiresOnDate);
    if (!Number.isNaN(d.getTime()) && d.getTime() > base.getTime()) return d.toISOString();
  }
  if (x.expiresInDays != null && x.expiresInDays > 0 && x.expiresInDays < 3650) {
    return new Date(base.getTime() + x.expiresInDays * 86_400_000).toISOString();
  }
  return null;
}

/**
 * Returns a validated Quote (status 'supplier_stated'), or null when the vendor stated no price.
 * Throws on operational failure (API error, refusal, unparsable output, ungroundable evidence);
 * callers mark the call 'failed' with the message and keep the transcript.
 */
export async function extractQuote(call: Call, opts: { now?: Date } = {}): Promise<Quote | null> {
  if (call.transcriptTurns.length < 2) return null;
  const extractedAt = opts.now ?? appNow();
  const base = new Date(call.recordedAt ?? call.endedAt ?? call.startedAt);
  if (!Number.isFinite(base.getTime())) throw new Error("Call timestamp is invalid; cannot determine the offer expiry.");

  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  const resp = await client.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Call date/time: ${base.toISOString()}\nRelative deadlines in the transcript refer to this original call date, even when replayed later.\nVendor being called: ${call.vendorId}\n\nTRANSCRIPT:\n${formatTranscript(call)}\n\nExtract the vendor's quote.`,
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(Extraction) },
  });

  if (resp.stop_reason === "refusal") throw new Error(`model declined to process the transcript (refusal${resp.stop_details?.category ? `: ${resp.stop_details.category}` : ""})`);
  const x = resp.parsed_output;
  if (!x) throw new Error(`model returned no parsable output (stop_reason: ${resp.stop_reason})`);
  if (!x.vendorStatedPrice) return null;

  // Sanitize tiers: positive, integer cents/seats, one per minSeats (cheapest), ascending.
  const byMin = new Map<number, number>();
  for (const t of x.tiers) {
    const minSeats = Math.max(1, Math.round(t.minSeats));
    const cents = Math.round(t.pricePerSeatDollars * 100);
    if (!(cents > 0)) continue;
    byMin.set(minSeats, Math.min(byMin.get(minSeats) ?? Infinity, cents));
  }
  const tiers = [...byMin.entries()].sort((a, b) => a[0] - b[0]).map(([minSeats, pricePerSeatCents]) => ({ minSeats, pricePerSeatCents }));
  if (tiers.length === 0) return null;

  const evidence = groundEvidence(x.evidence, call.transcriptTurns);
  if (evidence.length === 0) throw new Error("could not ground the extracted terms in the transcript (no verbatim vendor evidence found); refusing to create an unverifiable quote");

  return Quote.parse({
    id: newId("quote"),
    callId: call.id,
    vendorId: call.vendorId,
    tiers,
    perAccountFeeCents: Math.max(0, Math.round(x.perAccountFeeDollars * 100)),
    separateAccountsConfirmed: x.separateAccountsConfirmed,
    expiresAt: resolveExpiry(x, base),
    conditions: x.conditions.map((c) => c.trim()).filter(Boolean),
    evidence: evidence.join(" ... "),
    status: "supplier_stated",
    createdAt: extractedAt.toISOString(),
  });
}
