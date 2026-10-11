"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { PoolView, Quote } from "@/lib/contracts";
import { usdSeat } from "./format";
import { effectiveAllIn } from "@/lib/dial/prompt";
import { quoteIsValid } from "@/lib/settle";
import { listPriceFor } from "@/lib/vendors";

type Row = { x: number } & Record<string, number | null | undefined>;

const INK = "#12171c";
const ACCENT = "#059669";
const SLATE = "#64748b";
const GRID = "#e8ebee";
const VENDOR_COLOR: Record<string, string> = { certly: ACCENT, vantly: INK };

export default function PriceCurve({ view }: { view: PoolView }) {
  const { pool, orders, vendors, quotes } = view;
  const total = pool.totalSeats;

  const model = useMemo(() => {
    const listFor = (preferred: string | null) => {
      const price = listPriceFor(pool.category, preferred);
      return Number.isFinite(price) ? price : 3000;
    };
    const listCents = listFor(null);
    const memberIds = new Set(pool.memberOrderIds);
    const members = orders.filter((o) => memberIds.has(o.id));

    // Willingness to pay: min(list, max). No max means "list is fine".
    const willing = members.map((o) => ({
      seats: o.seats,
      cents: Math.min(listFor(o.preferredVendorId), o.maxPricePerSeatCents ?? listFor(o.preferredVendorId)),
    }));
    const prices = [...new Set(willing.map((w) => w.cents))].sort((a, b) => b - a);
    const demand: { x: number; y: number }[] = [];
    let prevQ = 0;
    prices.forEach((p, i) => {
      const q = willing.filter((w) => w.cents >= p).reduce((s, w) => s + w.seats, 0);
      if (i === 0) demand.push({ x: 0, y: p / 100 });
      demand.push({ x: prevQ, y: p / 100 }, { x: q, y: p / 100 });
      prevQ = q;
    });
    const demandMaxX = prevQ;

    // Latest quote per vendor.
    const latest = new Map<string, Quote>();
    [...quotes]
      .filter((q) => quoteIsValid(q, new Date(view.now)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((q) => latest.set(q.vendorId, q));
    const lastMin = Math.max(0, ...[...latest.values()].flatMap((q) => q.tiers.map((t) => t.minSeats)));
    const xMax = Math.max(20, Math.ceil(Math.max(total * 1.25, demandMaxX * 1.08, lastMin * 1.25) / 10) * 10);

    const vendorLines = [...latest.values()].map((q, i) => {
      const tiers = [...q.tiers].sort((a, b) => a.minSeats - b.minSeats);
      const pts: { x: number; y: number }[] = [];
      tiers.forEach((t, j) => {
        const next = tiers[j + 1];
        pts.push({ x: t.minSeats, y: t.pricePerSeatCents / 100 });
        pts.push({ x: next ? next.minSeats : xMax, y: t.pricePerSeatCents / 100 });
      });
      const vendor = vendors.find((v) => v.id === q.vendorId);
      const lastTier = tiers[tiers.length - 1];
      return {
        key: `q_${q.vendorId}`,
        name: `${vendor?.name ?? q.vendorId} quote`,
        color: VENDOR_COLOR[q.vendorId] ?? SLATE,
        pts,
        labelAt: lastTier ? { x: (lastTier.minSeats + xMax) / 2, y: lastTier.pricePerSeatCents / 100 } : null,
        labelPos: i % 2 === 0 ? ("top" as const) : ("bottom" as const),
        atTotal: effectiveAllIn(q, members, new Date(view.now))?.allInPerSeatCents ?? null,
        vendorName: vendor?.name ?? q.vendorId,
      };
    });

    const rows: Row[] = [
      ...demand.map((p) => ({ x: p.x, demand: p.y })),
      ...vendorLines.flatMap((l) => l.pts.map((p) => ({ x: p.x, [l.key]: p.y }))),
    ];

    const yVals = [listCents / 100, ...demand.map((d) => d.y), ...vendorLines.flatMap((l) => l.pts.map((p) => p.y))];
    const yLo = Math.max(0, Math.floor(Math.min(...yVals) * 0.88));
    const yHi = Math.ceil(Math.max(...yVals) * 1.08);
    const best = vendorLines
      .filter((l) => l.atTotal != null)
      .sort((a, b) => (a.atTotal as number) - (b.atTotal as number))[0];

    return { listCents, rows, vendorLines, xMax, yLo, yHi, best };
  }, [orders, pool, quotes, total, vendors, view.now]);

  const { listCents, rows, vendorLines, xMax, yLo, yHi, best } = model;
  const hasQuotes = vendorLines.length > 0;

  return (
    <div className="flex flex-col">
      <p className="max-w-[62ch] text-[15px] leading-snug" aria-live="polite">
        {hasQuotes ? (
          best ? (
            <>
              <span className="font-semibold">
                At {total} seats the best quote is {usdSeat(best.atTotal as number)} a seat
              </span>{" "}
              <span className="text-muted">
                from {best.vendorName}, down from {usdSeat(listCents)} list.
              </span>
            </>
          ) : (
            <span className="text-muted">No quote meets buyers&apos; price caps and the required volume.</span>
          )
        ) : (
          <span className="text-muted">Without an eligible quote, orders use the {usdSeat(listCents)} reference list price only when their cap allows it.</span>
        )}
      </p>
      <div className="-ml-1 mt-3 h-[260px] w-full min-w-0 sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 22, right: 18, bottom: 22, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, xMax]}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#5f6a75" }}
              tickLine={false}
              axisLine={{ stroke: "#cfd5db" }}
              label={{ value: "Seats in pool", position: "insideBottom", offset: -10, fontSize: 11, fill: "#5f6a75" }}
            />
            <YAxis
              type="number"
              domain={[yLo, yHi]}
              allowDecimals={false}
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fontSize: 11, fill: "#5f6a75" }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <ReferenceLine
              y={listCents / 100}
              stroke="#8f98a2"
              strokeDasharray="5 4"
              label={{ value: `List ${usdSeat(listCents)}`, position: "insideTopRight", fontSize: 11, fill: "#5f6a75" }}
            />
            <Line
              dataKey="demand"
              name="Buyers' max prices"
              stroke={SLATE}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={500}
              type="linear"
            />
            {vendorLines.map((l) => (
              <Line
                key={l.key}
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive
                animationDuration={600}
                type="linear"
              />
            ))}
            {vendorLines.map((l) =>
              l.labelAt ? (
                <ReferenceDot
                  key={`${l.key}_label`}
                  x={l.labelAt.x}
                  y={l.labelAt.y}
                  r={0}
                  label={{ value: l.name, position: l.labelPos, fontSize: 11, fontWeight: 600, fill: l.color, offset: 8 }}
                />
              ) : null,
            )}
            <ReferenceLine
              x={total}
              stroke={ACCENT}
              strokeWidth={1.5}
              label={{ value: `${total} seats in pool`, position: "top", fontSize: 11, fontWeight: 600, fill: ACCENT }}
            />
            {vendorLines.map((l) =>
              l.atTotal != null ? (
                <ReferenceDot
                  key={`${l.key}_dot`}
                  x={total}
                  y={l.atTotal / 100}
                  r={4.5}
                  fill={l.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              ) : null,
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[12px] text-muted">
        <Swatch color="#8f98a2" dashed label="List price" />
        <Swatch color={SLATE} label="Buyers' max (seats willing to pay at least this)" />
        {vendorLines.map((l) => (
          <Swatch key={l.key} color={l.color} label={l.name} />
        ))}
      </div>
    </div>
  );
}

function Swatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block w-4 border-t-2"
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
      />
      {label}
    </span>
  );
}
