import { createHash } from "node:crypto";
import { DemandEvent } from "../contracts";

// Prefixes keep our fixed IDs and SQL columns separate from other project events.
export const EVENT_TYPES = [
  { eventTypeId: 24000, name: "wantit_category", dataType: "string" },
  { eventTypeId: 24001, name: "wantit_synthetic", dataType: "bool" },
  { eventTypeId: 24002, name: "wantit_interest", dataType: "bool" },
  { eventTypeId: 24003, name: "wantit_quote_requested", dataType: "bool" },
  { eventTypeId: 24004, name: "wantit_abandoned_price", dataType: "price_usd_cent" },
  { eventTypeId: 24005, name: "wantit_max_price", dataType: "price_usd_cent" },
  { eventTypeId: 24006, name: "wantit_order_placed", dataType: "uint" },
  { eventTypeId: 24007, name: "wantit_order_canceled", dataType: "bool" },
  { eventTypeId: 24008, name: "wantit_deal_applied", dataType: "price_usd_cent" },
  { eventTypeId: 24009, name: "wantit_canceled_over_max", dataType: "bool" },
] as const;
export const EVENTS_HASH = createHash("sha256").update(JSON.stringify(EVENT_TYPES)).digest().readUInt32BE(0) || 1;
export type EventName = typeof EVENT_TYPES[number]["name"];
export type IngestEvent = { eventTypeId: number; dataType: string; timestamp: number; data: string | number | boolean };
export type Batch = { dataSessionId: string; batch: number; customEventsHash: number; installId: string; events: IngestEvent[] };

export function stableUuid(name: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex")).update(`want-it:${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function event(name: EventName, data: IngestEvent["data"], timestamp: number): IngestEvent {
  const definition = EVENT_TYPES.find((item) => item.name === name)!;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("Invalid event timestamp");
  if (definition.dataType === "string" && (typeof data !== "string" || data.length > 256)) throw new Error("Invalid string event");
  if (definition.dataType === "bool" && typeof data !== "boolean") throw new Error("Invalid boolean event");
  if (["uint", "price_usd_cent"].includes(definition.dataType) && (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0)) throw new Error("Invalid numeric event");
  return { eventTypeId: definition.eventTypeId, dataType: definition.dataType, timestamp, data };
}

export function demandBatch(input: DemandEvent): Batch {
  const parsed = DemandEvent.parse(input);
  const t = Math.floor(Date.parse(parsed.at) / 1000);
  const events = [event("wantit_category", parsed.category, t), event("wantit_synthetic", false, t)];
  switch (parsed.type) {
    case "order_placed":
      events.push(event("wantit_interest", true, t), event("wantit_order_placed", parsed.seats ?? 1, t));
      break;
    case "max_price_stated":
      if (parsed.priceCents == null) throw new Error("Missing maximum price");
      events.push(event("wantit_max_price", parsed.priceCents, t));
      break;
    case "deal_applied":
      if (parsed.priceCents == null) throw new Error("Missing deal price");
      events.push(event("wantit_deal_applied", parsed.priceCents, t));
      break;
    case "order_canceled": events.push(event("wantit_order_canceled", true, t)); break;
    case "canceled_over_max": events.push(event("wantit_canceled_over_max", true, t)); break;
  }
  return {
    dataSessionId: stableUuid(`event:${parsed.orderId}:${parsed.type}:${parsed.at}`), batch: 1,
    customEventsHash: EVENTS_HASH, installId: stableUuid(`buyer:${parsed.orderId}`), events,
  };
}

export function syntheticBatches(anchorSeconds: number): Batch[] {
  return Array.from({ length: 60 }, (_, i) => {
    const t = anchorSeconds - (1 + i * 89 / 60 | 0) * 86400;
    const events = [
      event("wantit_category", "soc2_compliance", t), event("wantit_synthetic", true, t + 1),
      event("wantit_interest", true, t + 2), event("wantit_quote_requested", true, t + 3),
      event("wantit_max_price", 1800 + (i * 137 % 801), t + 4),
      i < 21 ? event("wantit_abandoned_price", 3000, t + 5) : event("wantit_order_placed", 2 + i % 14, t + 5),
    ];
    return { dataSessionId: stableUuid(`backfill-v1:session:${i}`), batch: 1, customEventsHash: EVENTS_HASH, installId: stableUuid(`backfill-v1:buyer:${i}`), events };
  });
}
