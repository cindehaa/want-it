import type { Vendor } from "@/lib/contracts";

// Fictional TEST vendors. In VENDOR_MODE=ai (default) a Dial AI agent answers as each one on a single vendor
// number (persona PATCHed before every call, see lib/dial/vendorPersonas.ts). In VENDOR_MODE=human the phone
// numbers live in env only (<VENDORID>_PHONE) and teammates who consented answer.
export const VENDORS: Vendor[] = [
  { id: "certly", name: "Certly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3000 },
  { id: "vantly", name: "Vantly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3200 },
  { id: "trustwise", name: "Trustwise", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3400 },
  { id: "auditly", name: "Auditly", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 2800 },
  { id: "complykit", name: "ComplyKit", isTestVendor: true, category: "soc2_compliance", listPricePerSeatCents: 3100 },
];

/** One negotiation round: the fixed order in which the agent calls the test vendors (strictly one call at a time). */
export const NEGOTIATION_ORDER: string[] = ["certly", "vantly", "trustwise", "auditly", "complykit"];

/** Vendors whose list prices anchor the buyer-facing reference price (the original two-vendor demo). */
const REFERENCE_VENDOR_IDS = ["certly", "vantly"];

/** Human-mode phone: <VENDORID>_PHONE in env (CERTLY_PHONE, VANTLY_PHONE, TRUSTWISE_PHONE, ...). */
export const vendorPhoneEnvName = (vendorId: string): string => `${vendorId.toUpperCase()}_PHONE`;
export const vendorPhone = (vendorId: string): string | undefined => process.env[vendorPhoneEnvName(vendorId)];

/**
 * Reference list price a buyer sees at checkout: the lowest list price among the anchor vendors (Certly, Vantly)
 * in the category, so adding more test vendors to the negotiation does not silently change what buyers hold or pay
 * at "list". With a preferred vendor it is that vendor's own list price.
 */
export function listPriceFor(category: string, preferredVendorId: string | null): number {
  const inCategory = VENDORS.filter((v) => v.category === category);
  const anchors = inCategory.filter((v) => REFERENCE_VENDOR_IDS.includes(v.id));
  const vs = preferredVendorId ? inCategory.filter((v) => v.id === preferredVendorId) : anchors.length > 0 ? anchors : inCategory;
  return Math.min(...vs.map((v) => v.listPricePerSeatCents));
}
