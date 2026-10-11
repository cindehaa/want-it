import { Batch, EVENTS_HASH, EVENT_TYPES } from "./events";

const API = "https://api.keewano.com/event/ingress/v1/json";
const registered = new Map<string, Promise<void>>();

async function post(path: string, body: unknown, key: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${API}/${path}`, {
    method: "POST", headers: { "k-token": key, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw new Error(`Keewano ${path} HTTP ${response.status}`);
  return response.json();
}

export async function registerEvents(key: string, signal: AbortSignal): Promise<void> {
  let pending = registered.get(key);
  if (!pending) {
    pending = (async () => {
      const ack = await post("custom", { customEventsHash: EVENTS_HASH, eventTypes: EVENT_TYPES }, key, signal) as { status?: string };
      if (!["registered", "already_registered"].includes(ack.status ?? "")) {
        throw new Error("Keewano custom event registration is not confirmed; run backfill again shortly");
      }
    })();
    registered.set(key, pending);
    pending.catch(() => registered.delete(key));
  }
  await pending;
}

export async function sendBatch(batch: Batch, key: string, signal: AbortSignal): Promise<{ received: number; accepted: number }> {
  await registerEvents(key, signal);
  const ack = await post("in", batch, key, signal) as { received?: number; accepted?: number };
  if (ack.received !== batch.events.length || typeof ack.accepted !== "number" || ![0, batch.events.length].includes(ack.accepted)) {
    throw new Error("Keewano did not acknowledge the complete batch");
  }
  return { received: ack.received, accepted: ack.accepted };
}
