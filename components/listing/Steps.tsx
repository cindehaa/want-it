/* A list of steps that complete one at a time: a spinning ring on the active step, a drawn check on done steps. */

export type StepDef = readonly [label: string, meta: string];

export function stepState(elapsed: number, index: number, per: number) {
  const done = elapsed >= (index + 1) * per;
  const active = !done && elapsed >= index * per;
  return { done, active };
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path className="wi-check" d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

function Ring() {
  return <span className="wi-ring box-border inline-block h-3.5 w-3.5 rounded-full border-2 border-[#cfd5db] border-t-accent" />;
}

export default function Steps({ steps, elapsed, per = 1 }: { steps: readonly StepDef[]; elapsed: number; per?: number }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {steps.map(([label, meta], i) => {
        const { done, active } = stepState(elapsed, i, per);
        const reached = done || active;
        return (
          <li
            key={label}
            className={`grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 text-base ${reached ? "wi-step-new text-ink" : "text-faint"}`}
          >
            <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center">
              {done ? <Check /> : active ? <Ring /> : null}
            </span>
            <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
            <span className="tabular text-[13px] text-muted">{reached ? meta : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
