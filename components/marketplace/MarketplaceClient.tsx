"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fmtRemaining } from "@/components/pool/format";
import { poolFacts } from "@/components/negotiation/derive";
import type { PoolView } from "@/lib/contracts";
import { VENDORS } from "@/lib/vendors";
import LiveDot from "./LiveDot";
import SearchForm from "./SearchForm";
import Sidebar from "./Sidebar";
import VendorCard from "./VendorCard";
import { CATEGORY, buildCards, parseNeed } from "./derive";
import { usePoolView } from "./usePoolView";

const SOON = ["Penetration testing", "Password manager seats", "Cloud cost monitoring", "Device management"];

function poolLine(view: PoolView): { live: boolean; text: string } {
  const f = poolFacts(view);
  const seats = `${f.seats} ${f.seats === 1 ? "seat" : "seats"} from ${f.startups} ${f.startups === 1 ? "startup" : "startups"}`;
  const remaining = fmtRemaining(new Date(view.pool.windowClosesAt).getTime() - new Date(view.now).getTime());
  switch (view.pool.status) {
    case "open":
      return { live: true, text: `Pool open: ${seats}, ${remaining === "closed" ? "window closed" : `closes in ${remaining}`}` };
    case "negotiating":
      return { live: true, text: `Pool negotiating: ${seats}` };
    case "deal_found":
      return { live: false, text: `Deal found: ${seats}` };
    case "no_deal":
      return { live: false, text: `No deal this round: ${seats}` };
    case "settled":
      return { live: false, text: `Pool settled: ${seats}` };
  }
}

export default function MarketplaceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [seats, setSeats] = useState(() => params.get("seats") ?? "10");
  const [max, setMax] = useState(() => params.get("max") ?? "");
  const [query, setQuery] = useState("");
  const { view, failed } = usePoolView(5000);

  // Persist the need in the URL so the Join links and a reload keep it.
  useEffect(() => {
    const next = new URLSearchParams(params.toString());
    if (seats.trim()) next.set("seats", seats.trim());
    else next.delete("seats");
    if (max.trim()) next.set("max", max.trim());
    else next.delete("max");
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [seats, max, params, pathname, router]);

  const need = useMemo(() => parseNeed(seats, max), [seats, max]);
  const vendors = useMemo(() => VENDORS.filter((v) => v.category === CATEGORY), []);
  const cards = useMemo(() => buildCards(vendors, view), [vendors, view]);
  const q = query.trim().toLowerCase();
  const shownVendors = q ? cards.vendors.filter((v) => v.name.toLowerCase().includes(q)) : cards.vendors;
  const status = view ? poolLine(view) : null;

  return (
    <div className="mx-auto box-border grid w-full max-w-[1400px] grid-cols-[220px_minmax(0,1fr)] gap-8 px-6 pb-10 pt-6">
      <Sidebar seats={seats} max={max} onSeats={setSeats} onMax={setMax} />

      <main className="flex min-w-0 flex-col gap-8">
        <SearchForm value={query} onChange={setQuery} />

        <section aria-label="SOC 2 compliance software" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">SOC 2 compliance software</h1>
              <p className="m-0 mt-1 text-sm text-muted">Per seat, your own account. Five test vendors, one pool, one negotiated price.</p>
            </div>
            <p className="tabular m-0 flex items-center gap-2 text-sm">
              {status ? (
                <>
                  {status.live && <LiveDot />}
                  {status.text}
                </>
              ) : (
                <span className="text-muted">{failed ? "Pool status unavailable, showing list prices" : "Checking the pool"}</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <VendorCard card={cards.any} need={need} />
            {shownVendors.map((v) => (
              <VendorCard key={v.id} card={v} need={need} />
            ))}
          </div>
          {q && shownVendors.length === 0 && <p className="m-0 text-sm text-muted">No vendor matches &quot;{query.trim()}&quot;. The pool is still open to any vendor.</p>}
        </section>

        <section aria-label="Pools opening soon" className="flex flex-col gap-2 border-t border-line pt-5">
          <h2 className="m-0 text-[15px] font-semibold">Pools opening soon</h2>
          <p className="m-0 text-sm leading-[1.6] text-muted">
            A pool opens when 50 seats are asked for. Asking holds nothing.{" "}
            {SOON.map((name, i) => (
              <span key={name}>
                <Link href="/" className="text-ink hover:text-accent-strong">
                  {name}
                </Link>
                {i < SOON.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </section>
      </main>
    </div>
  );
}
