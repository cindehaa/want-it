"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Lane } from "./derive";
import { ratchetSeries } from "./derive";

const INK = "#12171c";
const ACCENT = "#059669";
const FAINT = "#8f98a2";
const LINE = "#e1e4e8";

type TipProps = { active?: boolean; label?: string | number; payload?: { dataKey?: string | number; value?: number | null }[] };

function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload) return null;
  const best = payload.find((p) => p.dataKey === "best")?.value;
  const offer = payload.find((p) => p.dataKey === "offer")?.value;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-semibold">{label}</div>
      {offer != null && <div className="tabular text-muted">This call: ${offer.toFixed(2)}</div>}
      {best != null && <div className="tabular text-accent-strong">Best so far: ${best.toFixed(2)}</div>}
    </div>
  );
}

export default function RatchetChart({ lanes }: { lanes: Lane[] }) {
  const { points, lowestList } = useMemo(() => ratchetSeries(lanes), [lanes]);
  const vals = points.flatMap((p) => [p.best, p.offer]).filter((v): v is number => v != null);
  const lo = Math.max(0, Math.floor(Math.min(...vals, lowestList / 100) - 2));
  const hi = Math.ceil(lowestList / 100 + 1);
  const latest = [...points].reverse().find((p) => p.best != null);
  const calledAny = points.some((p, i) => i > 0 && p.best != null);

  return (
    <section aria-labelledby="ratchet-h" className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="ratchet-h" className="text-sm font-semibold">
          Best offer so far
        </h2>
        <p className="tabular text-xs text-muted">
          {calledAny && latest?.best != null ? (
            <>
              <s>${(lowestList / 100).toFixed(2)}</s> <span className="font-medium text-accent-strong">${latest.best.toFixed(2)} per seat</span>
            </>
          ) : (
            "Each call cites the lowest price so far"
          )}
        </p>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted">
        The price ratchets down as each call cites the best offer in hand. Dots are each vendor&rsquo;s own effective price.
      </p>
      <div
        className="mt-3 min-h-[230px] w-full flex-1"
        role="img"
        aria-label={`Best effective offer per seat after each call: ${points
          .filter((p) => p.best != null)
          .map((p) => `${p.label} $${p.best?.toFixed(2)}`)
          .join(", ")}`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 230 }}>
          <ComposedChart data={points} margin={{ top: 8, right: 26, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: FAINT }} tickLine={false} axisLine={{ stroke: LINE }} interval={0} />
            <YAxis
              domain={[lo, hi]}
              tick={{ fontSize: 11, fill: FAINT }}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={(v: number) => `$${v}`}
              allowDecimals={false}
            />
            <Tooltip content={<Tip />} cursor={{ stroke: LINE }} />
            <Line
              dataKey="best"
              type="stepAfter"
              stroke={ACCENT}
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              isAnimationActive
              animationDuration={500}
              connectNulls={false}
            />
            <Line
              dataKey="offer"
              stroke="none"
              dot={{ r: 4, stroke: INK, strokeWidth: 1.5, fill: "#ffffff" }}
              activeDot={{ r: 5, stroke: INK, strokeWidth: 1.5, fill: "#ffffff" }}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
