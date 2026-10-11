"use client";

import Link from "next/link";

const SECTIONS = [
  { href: "/", label: "Browse", current: true },
  { href: "/orders", label: "Your orders", current: false },
  { href: "/negotiation", label: "Live negotiations", current: false },
];

/** Only Compliance is a real category today; the rest are placeholders with no destination. */
const CATEGORIES: { label: string; href: string | null; current?: boolean }[] = [
  { label: "All software", href: null },
  { label: "Compliance", href: "/", current: true },
  { label: "Security", href: null },
  { label: "DevOps and cloud", href: null },
  { label: "HR and payroll", href: null },
  { label: "Design and product", href: null },
  { label: "Sales and support", href: null },
];

const ITEM = "block rounded-md px-2.5 py-[7px] text-sm no-underline";
const IDLE = `${ITEM} text-muted hover:bg-[#eceff2] hover:text-ink`;
const CURRENT = `${ITEM} bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]`;
const INPUT = "tabular h-9 rounded-md border border-[#cfd5db] bg-surface px-2.5 text-sm text-ink";

export type SidebarProps = {
  seats: string;
  max: string;
  onSeats: (v: string) => void;
  onMax: (v: string) => void;
};

export default function Sidebar({ seats, max, onSeats, onMax }: SidebarProps) {
  return (
    <aside aria-label="Browse" className="flex flex-col gap-[22px]">
      <Link
        href="/listing/new"
        className="mb-1 inline-flex h-10 items-center justify-center rounded-md bg-accent text-sm font-semibold text-white no-underline hover:bg-accent-strong"
      >
        New listing
      </Link>

      <nav aria-label="Sections" className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} aria-current={s.current ? "page" : undefined} className={s.current ? CURRENT : IDLE}>
            {s.label}
          </Link>
        ))}
      </nav>

      <nav aria-label="Categories" className="flex flex-col gap-0.5">
        <span className="px-2.5 pb-1.5 text-xs font-medium text-muted">Categories</span>
        {CATEGORIES.map((c) =>
          c.href ? (
            <Link key={c.label} href={c.href} aria-current={c.current ? "page" : undefined} className={c.current ? CURRENT : IDLE}>
              {c.label}
            </Link>
          ) : (
            <span key={c.label} aria-disabled="true" className={`${ITEM} text-muted`}>
              {c.label}
            </span>
          ),
        )}
      </nav>

      <div className="flex flex-col gap-2 border-t border-line px-2.5 pt-[18px]">
        <span className="text-xs font-medium text-muted">Your need</span>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Seats
          <input type="number" inputMode="numeric" min={1} max={500} value={seats} onChange={(e) => onSeats(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Max per seat, optional
          <input type="number" inputMode="decimal" min={1} step="any" placeholder="$" value={max} onChange={(e) => onMax(e.target.value)} className={INPUT} />
        </label>
      </div>
    </aside>
  );
}
