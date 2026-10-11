import type { Metadata } from "next";
import { Suspense } from "react";
import MarketplaceClient from "@/components/marketplace/MarketplaceClient";

export const metadata: Metadata = { title: "Marketplace, want-it" };

export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceClient />
    </Suspense>
  );
}
