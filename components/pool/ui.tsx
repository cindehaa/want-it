import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "warn" | "danger" | "ink";

const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-muted border-line",
  accent: "bg-accent-soft text-accent-strong border-accent/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  ink: "bg-ink text-white border-ink",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Dot({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />;
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
