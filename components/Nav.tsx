"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/", label: "Buy" },
  { href: "/pool", label: "Marketplace" },
  { href: "/negotiation", label: "Negotiation" },
];

export default function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-[2000] border-b border-line bg-surface">
      <nav aria-label="Primary" className="flex h-12 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-ink">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          want-it
        </Link>
        <ul className="m-0 flex list-none items-center gap-1 p-0 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-1.5 transition-colors ${
                    active ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
