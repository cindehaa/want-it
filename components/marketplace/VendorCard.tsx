import Link from "next/link";
import { usdSeat } from "@/components/pool/format";
import LiveDot from "./LiveDot";
import { atMostCents, countWord, orderHref, percentBelow, usdTotal, type AnyCardModel, type Need, type VendorCardModel } from "./derive";

type Shown = {
  name: string;
  href: string;
  live: boolean;
  status: string;
  priceCents: number;
  priceMuted: boolean;
  priceLabel: string;
  sub: string;
  forYou: string;
  cta: string;
  primary: boolean;
};

function forYouLine(need: Need, listCents: number, priced: boolean): string {
  const seats = `${need.seats} ${need.seats === 1 ? "seat" : "seats"}`;
  if (!priced && need.maxCents == null) return seats;
  return `${seats}, at most ${usdTotal(atMostCents(need.seats, listCents, need.maxCents))}`;
}

function shownFor(card: AnyCardModel | VendorCardModel, need: Need): Shown {
  if (card.kind === "any") {
    const priced = card.bestCents != null;
    return {
      name: "Any vendor",
      href: orderHref(null, need),
      live: false,
      status: "Best price wins",
      priceCents: card.bestCents ?? card.referenceListCents,
      priceMuted: false,
      priceLabel: priced ? "a seat, best so far" : "a seat, list",
      sub: `from ${usdSeat(card.lowestListCents)} list across ${countWord(card.vendorCount)} vendors`,
      forYou: forYouLine(need, card.referenceListCents, priced),
      cta: "Join the pool",
      primary: true,
    };
  }
  const priced = card.quoteCents != null;
  return {
    name: card.name,
    href: orderHref(card.id, need),
    live: card.status === "live",
    status: card.status === "live" ? "On the phone now" : card.status === "quoted" ? "Quoted" : "Not called yet",
    priceCents: card.quoteCents ?? card.listCents,
    priceMuted: card.status === "waiting",
    priceLabel: priced ? "a seat for this pool" : "a seat, list",
    sub: priced ? `list ${usdSeat(card.listCents)}, ${percentBelow(card.quoteCents as number, card.listCents)}% below` : "no quote for this pool yet",
    forYou: forYouLine(need, card.listCents, priced),
    cta: `Join with ${card.name}`,
    primary: false,
  };
}

export default function VendorCard({ card, need }: { card: AnyCardModel | VendorCardModel; need: Need }) {
  const s = shownFor(card, need);
  const top = card.kind === "any";
  return (
    <article
      aria-label={s.name}
      className={`flex min-w-0 flex-col overflow-hidden rounded-[10px] border bg-surface ${top ? "border-ink" : "border-line"}`}
    >
      <div className="flex flex-col gap-2.5 border-b border-[#f0f2f4] px-5 pb-3.5 pt-[18px]">
        <div className="flex items-center justify-between gap-2.5">
          <Link href={s.href} className="text-base font-semibold text-ink no-underline hover:text-accent-strong">
            {s.name}
          </Link>
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${s.live ? "text-accent-strong" : "text-muted"}`}>
            {s.live && <LiveDot size={6} />}
            {s.status}
          </span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className={`tabular text-[34px] font-semibold leading-none tracking-[-0.03em] ${s.priceMuted ? "text-muted" : "text-ink"}`}>
            {usdSeat(s.priceCents)}
          </span>
          <span className="text-[13px] text-muted">{s.priceLabel}</span>
        </div>
        <p className="tabular m-0 text-[13px] text-muted">{s.sub}</p>
      </div>
      <div className="flex items-center justify-between gap-2.5 px-5 pb-4 pt-3">
        <span className="tabular text-[13px] text-muted">{s.forYou}</span>
        <Link
          href={s.href}
          className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-[13px] font-semibold no-underline ${
            s.primary ? "bg-ink text-white hover:bg-[#2a3138]" : "border border-[#cfd5db] bg-surface text-ink hover:bg-canvas"
          }`}
        >
          {s.cta}
        </Link>
      </div>
    </article>
  );
}
