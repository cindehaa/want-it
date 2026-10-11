"use client";

export default function SearchForm({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <form
      role="search"
      onSubmit={(e) => e.preventDefault()}
      className="box-border flex h-[42px] w-full max-w-[680px] items-center gap-2.5 rounded-lg border-[1.5px] border-ink bg-surface py-0 pl-3.5 pr-1"
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="shrink-0 text-ink">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        type="search"
        aria-label="Search software"
        placeholder="Search software: SOC 2, pen test, password manager"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
      />
      <button type="submit" className="h-8 cursor-pointer rounded-md border-0 bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-[#2a3138]">
        Search
      </button>
    </form>
  );
}
