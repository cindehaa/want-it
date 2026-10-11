// Pure derivations for the marketplace cards. Price semantics follow components/negotiation/derive.ts:
// a vendor's card price is the latest quote's tier price at the current pool size, else its list price.
import type { Call, Order, PoolView, Quote, Vendor } from "@/lib/contracts";
import { effectiveFor, poolFacts, tierPrice } from "@/components/negotiation/derive";
import { listPriceFor } from "@/lib/vendors";

export const CATEGORY = "soc2_compliance" as const;

export type VendorStatus = "live" | "quoted" | "waiting";

export type VendorCardModel = {
  kind: "vendor";
  id: string;
  name: string;
  status: VendorStatus;
  listCents: number;
  /** Price per seat at the current pool size when a quote exists. */
  quoteCents: number | null;
};

export type AnyCardModel = {
  kind: "any";
  /** Lowest quoted price across vendors, or null when nothing is quoted yet. */
  bestCents: number | null;
  /** Lowest list price across the vendors in the category. */
  lowestListCents: number;
  /** Reference list price a buyer holds against (lib/vendors listPriceFor). */
  referenceListCents: number;
  vendorCount: number;
};

export type CardModel = AnyCardModel | VendorCardModel;

const IN_PROGRESS = new Set<Call["status"]>(["queued", "in_progress"]);

function members(view: PoolView): Order[] {
  const ids = new Set(view.pool.memberOrderIds);
  return view.orders.filter((o) => ids.has(o.id));
}

function latestQuote(view: PoolView, vendorId: string): Quote | null {
  const qs = view.quotes.filter((q) => q.vendorId === vendorId);
  if (qs.length === 0) return null;
  return qs.reduce((a, b) => (new Date(b.createdAt).getTime() > new Date(a.createdAt).getTime() ? b : a));
}

export function vendorCard(vendor: Vendor, view: PoolView | null): VendorCardModel {
  const base: VendorCardModel = { kind: "vendor", id: vendor.id, name: vendor.name, status: "waiting", listCents: vendor.listPricePerSeatCents, quoteCents: null };
  if (!view) return base;
  const live = view.calls.some((c) => c.vendorId === vendor.id && IN_PROGRESS.has(c.status));
  const quote = latestQuote(view, vendor.id);
  let quoteCents: number | null = null;
  if (quote) {
    const eff = effectiveFor(quote, members(view), new Date(view.now));
    quoteCents = eff?.tierCents ?? tierPrice(quote, poolFacts(view).seats);
  }
  return { ...base, status: live ? "live" : quoteCents != null ? "quoted" : "waiting", quoteCents };
}

export function anyCard(vendors: VendorCardModel[], allVendors: Vendor[]): AnyCardModel {
  const quoted = vendors.map((v) => v.quoteCents).filter((c): c is number => c != null);
  return {
    kind: "any",
    bestCents: quoted.length > 0 ? Math.min(...quoted) : null,
    lowestListCents: Math.min(...allVendors.map((v) => v.listPricePerSeatCents)),
    referenceListCents: listPriceFor(CATEGORY, null),
    vendorCount: allVendors.length,
  };
}

export function buildCards(allVendors: Vendor[], view: PoolView | null): { any: AnyCardModel; vendors: VendorCardModel[] } {
  const vendors = allVendors.map((v) => vendorCard(v, view));
  return { any: anyCard(vendors, allVendors), vendors };
}

export function percentBelow(quoteCents: number, listCents: number): number {
  return Math.round((1 - quoteCents / listCents) * 100);
}

/** Dollars a buyer of `seats` holds at most: seats x min(list, max). */
export function atMostCents(seats: number, listCents: number, maxCents: number | null): number {
  return seats * (maxCents != null ? Math.min(listCents, maxCents) : listCents);
}

/** "$300" or "$1,234.50": a total, grouped, with decimals only when needed. */
export function usdTotal(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const countWord = (n: number): string => WORDS[n] ?? String(n);

export type Need = { seats: number; maxCents: number | null };

export function parseNeed(seatsRaw: string | null, maxRaw: string | null): Need {
  const s = Math.floor(Number(seatsRaw));
  const m = Number(maxRaw);
  return {
    seats: Number.isFinite(s) && s >= 1 ? Math.min(500, s) : 10,
    maxCents: maxRaw && Number.isFinite(m) && m > 0 ? Math.round(m * 100) : null,
  };
}

export function orderHref(vendorId: string | null, need: Need): string {
  const p = new URLSearchParams();
  if (vendorId) p.set("vendor", vendorId);
  p.set("seats", String(need.seats));
  if (need.maxCents != null) p.set("max", String(need.maxCents / 100));
  return `/order?${p.toString()}`;
}
