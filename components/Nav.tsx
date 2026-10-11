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
    <header className="sticky top-0 z-[2000] border-b border-line bg-surface/90 backdrop-blur">
      <nav className="mx-auto flex h-12 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          want-it
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
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
