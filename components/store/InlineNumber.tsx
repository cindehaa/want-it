"use client";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  prefix?: string;
};

/** A real number input styled to sit inside a sentence, with a visually-hidden label. */
export default function InlineNumber({ label, value, onChange, min, max, step, prefix }: Props) {
  return (
    <label className="inline">
      <span className="sr-only">{label}</span>
      {prefix && <span className="text-muted">{prefix}</span>}
      <input
        className="wi-inline-num"
        type="number"
        inputMode={step === "any" ? "decimal" : "numeric"}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
