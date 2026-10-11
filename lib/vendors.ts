import type { Vendor } from "@/lib/contracts";

// Fictional TEST vendors. Phones answered by teammates who consented; numbers live in env only.
export const VENDORS: Vendor[] = [
  { id: "certly", name: "Certly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3000 },
  { id: "vantly", name: "Vantly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3200 },
];

export const vendorPhone = (vendorId: string): string | undefined =>
  vendorId === "certly" ? process.env.CERTLY_PHONE : vendorId === "vantly" ? process.env.VANTLY_PHONE : undefined;

/** Reference list price a buyer sees at checkout: the lowest list price in the category. */
export function listPriceFor(category: string, preferredVendorId: string | null): number {
  const vs = VENDORS.filter((v) => v.category === category && (!preferredVendorId || v.id === preferredVendorId));
  return Math.min(...vs.map((v) => v.listPricePerSeatCents));
}
