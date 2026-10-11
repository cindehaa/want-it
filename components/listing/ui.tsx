import Link from "next/link";
import type { ReactNode } from "react";

/* Shared bits for the new-listing flow. Buttons are plain rectangles, no pills; numbers are tabular. */

const PRIMARY =
  "inline-flex h-12 items-center justify-center gap-2.5 rounded-lg px-[22px] text-[15px] font-semibold text-white transition-colors";
const QUIET =
  "inline-flex h-12 items-center rounded-lg border border-[#cfd5db] bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas";

export function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${PRIMARY} bg-accent hover:bg-accent-strong`}>
      {children}
    </button>
  );
}

export function PrimaryLink({ href, children, tone = "accent" }: { href: string; children: ReactNode; tone?: "accent" | "ink" }) {
  const color = tone === "ink" ? "bg-ink hover:bg-[#2a3139]" : "bg-accent hover:bg-accent-strong";
  return (
    <Link href={href} className={`${PRIMARY} ${color}`}>
      {children}
    </Link>
  );
}

export function QuietButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={QUIET}>
      {children}
    </button>
  );
}

export function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={QUIET}>
      {children}
    </Link>
  );
}

export function Screen({ label, live, className = "", children }: { label: string; live?: boolean; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} aria-live={live ? "polite" : undefined} className={`wi-screen flex flex-col ${className}`}>
      {children}
    </section>
  );
}

export function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-[30px] font-semibold leading-[1.1] tracking-[-0.025em]">{title}</h1>
      <p className="m-0 text-[15px] text-muted">{children}</p>
    </div>
  );
}

export function Card({ strong, className = "", children }: { strong?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[10px] border bg-surface ${strong ? "border-ink" : "border-line"} ${className}`}>{children}</div>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 mt-0.5">{children}</dd>
    </div>
  );
}
