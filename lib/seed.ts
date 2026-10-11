// Demo seed: ~14 SIMULATED startups around the SF Bay Area. Always labeled "(simulated)".
import type { Order } from "@/lib/contracts";
import { newId, put, resetAll, kvSet } from "@/lib/db";
import { now } from "@/lib/clock";
import { getOrCreatePool, recomputePool } from "@/lib/pool";
import { listPriceFor } from "@/lib/vendors";

/** Reference list price per seat; falls back to $30 for categories no test vendor sells (never settled anyway). */
export function listPriceOrDefault(category: string, preferredVendorId: string | null): number {
  const p = listPriceFor(category, preferredVendorId);
  return Number.isFinite(p) ? p : 3000;
}

type Seed = {
  name: string;
  city: string;
  lat: number;
  lng: number;
  seats: number;
  maxCents: number | null;
  hoursAgo: number;
  preferredVendorId?: string | null;
  category?: Order["category"];
  deadline?: "early"; // deadline before the pool window closes
};

const SEEDS: Seed[] = [
  { name: "Acme Robotics", city: "SoMa, San Francisco", lat: 37.7785, lng: -122.4056, seats: 12, maxCents: 2400, hoursAgo: 47 },
  { name: "Brightloop Labs", city: "Mission, San Francisco", lat: 37.7599, lng: -122.4148, seats: 6, maxCents: null, hoursAgo: 44 },
  { name: "Cobalt Health", city: "Palo Alto", lat: 37.4419, lng: -122.143, seats: 15, maxCents: 2200, hoursAgo: 41 },
  { name: "Dunmore AI", city: "Oakland", lat: 37.8044, lng: -122.2712, seats: 4, maxCents: 2600, hoursAgo: 38 },
  { name: "Eastside Payments", city: "Mountain View", lat: 37.3861, lng: -122.0839, seats: 9, maxCents: null, hoursAgo: 35 },
  { name: "Fernwood Bio", city: "Berkeley", lat: 37.8715, lng: -122.273, seats: 3, maxCents: 1800, hoursAgo: 31 },
  { name: "Glimmer Analytics", city: "Hayes Valley, San Francisco", lat: 37.7759, lng: -122.4245, seats: 8, maxCents: 2500, hoursAgo: 27 },
  { name: "Harbor Logistics", city: "Redwood City", lat: 37.4852, lng: -122.2364, seats: 10, maxCents: null, hoursAgo: 24, preferredVendorId: "certly" },
  { name: "Ionic Security", city: "San Jose", lat: 37.3382, lng: -121.8863, seats: 7, maxCents: 2300, hoursAgo: 20 },
  { name: "Juniper Pay", city: "FiDi, San Francisco", lat: 37.7946, lng: -122.3999, seats: 5, maxCents: 2000, hoursAgo: 16 },
  { name: "Kestrel Data", city: "Sunnyvale", lat: 37.3688, lng: -122.0363, seats: 11, maxCents: null, hoursAgo: 11 },
  { name: "Lumen Mobility", city: "Dogpatch, San Francisco", lat: 37.758, lng: -122.388, seats: 6, maxCents: 2600, hoursAgo: 7 },
  // Excluded: wrong category (dev tools, not SOC 2 software)
  { name: "Northstar Ledger", city: "Menlo Park", lat: 37.453, lng: -122.1817, seats: 5, maxCents: null, hoursAgo: 4, category: "dev_tools" },
  // Excluded: needs the software before the pool window closes
  { name: "Orchid Systems", city: "Emeryville", lat: 37.8313, lng: -122.2852, seats: 4, maxCents: 2800, hoursAgo: 2, deadline: "early" },
];

export function seedDemo() {
  resetAll();
  kvSet("clockOffsetHours", "0");
  const pool = getOrCreatePool();
  const t = now().getTime();
  const windowClose = new Date(pool.windowClosesAt).getTime();
  SEEDS.forEach((s, i) => {
    const category = s.category ?? "soc2_compliance";
    const preferredVendorId = s.preferredVendorId ?? null;
    const list = listPriceOrDefault(category, preferredVendorId);
    const created = new Date(t - s.hoursAgo * 3600_000).toISOString();
    const deadline = new Date(s.deadline === "early" ? windowClose - 24 * 3600_000 : windowClose + 7 * 24 * 3600_000).toISOString();
    put("orders", {
      id: newId("ord"),
      idempotencyKey: `seed-sim-${String(i + 1).padStart(2, "0")}`,
      buyerName: `${s.name} (simulated)`,
      isSimulated: true,
      category,
      seats: s.seats,
      maxPricePerSeatCents: s.maxCents,
      preferredVendorId,
      lat: s.lat,
      lng: s.lng,
      city: s.city,
      deadline,
      holdAmountCents: s.seats * Math.min(list, s.maxCents ?? list),
      status: "held",
      finalPricePerSeatCents: null,
      redemptionLink: null,
      poolId: null,
      createdAt: created,
      updatedAt: created,
    });
  });
  return recomputePool();
}
