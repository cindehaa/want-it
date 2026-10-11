"use client";

// Simple SVG plot of the Bay Area from real lat/lng. (components/pool/DemandMap fits its bounds once on
// first render, so it can't show buyers arriving one by one.)

export type DotState = "arrived" | "member" | "excluded";

export type MapDot = {
  id: string;
  name: string;
  seats: number;
  lat: number;
  lng: number;
  state: DotState;
  detail: string;
};

const W = 640;
const H = 560;
const LAT_TOP = 37.94;
const PX_PER_LAT = 848;
const PX_PER_LNG = PX_PER_LAT * 0.79; // cos(37.6deg): equal ground distance on both axes
const LNG_LEFT = -122.72;

function px(lat: number, lng: number): [number, number] {
  return [(lng - LNG_LEFT) * PX_PER_LNG, (LAT_TOP - lat) * PX_PER_LAT];
}

// Rough shoreline, [lng, lat]. Pacific first, then the bay (San Pablo, SF, South Bay).
const OCEAN: [number, number][] = [
  [-122.72, 38.1], [-122.71, 37.92], [-122.58, 37.86], [-122.53, 37.82], [-122.51, 37.81], [-122.512, 37.78],
  [-122.51, 37.7], [-122.5, 37.6], [-122.46, 37.5], [-122.41, 37.37], [-122.39, 37.2], [-122.72, 37.2],
];
const BAY: [number, number][] = [
  [-122.53, 37.82], [-122.51, 37.81], [-122.47, 37.807], [-122.43, 37.806], [-122.395, 37.8], [-122.385, 37.77],
  [-122.375, 37.735], [-122.385, 37.7], [-122.375, 37.64], [-122.36, 37.615], [-122.31, 37.585], [-122.29, 37.56],
  [-122.24, 37.51], [-122.16, 37.48], [-122.1, 37.47], [-122.04, 37.46], [-121.99, 37.44], [-121.97, 37.47],
  [-122.0, 37.52], [-122.06, 37.55], [-122.12, 37.6], [-122.17, 37.66], [-122.22, 37.72], [-122.26, 37.765],
  [-122.3, 37.8], [-122.31, 37.84], [-122.32, 37.885], [-122.375, 37.915], [-122.41, 37.94], [-122.43, 37.97],
  [-122.3, 38.1], [-122.55, 38.1], [-122.5, 38.05], [-122.48, 37.99], [-122.5, 37.95], [-122.49, 37.92],
  [-122.46, 37.89], [-122.48, 37.865], [-122.5, 37.855], [-122.485, 37.835],
];
const toPath = (pts: [number, number][]) =>
  pts
    .map(([lng, lat], i) => {
      const [x, y] = px(lat, lng);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ") + "Z";

const PLACES: { name: string; lat: number; lng: number; anchor?: "start" | "end" | "middle" }[] = [
  { name: "San Francisco", lat: 37.76, lng: -122.465, anchor: "end" },
  { name: "Oakland", lat: 37.775, lng: -122.235, anchor: "start" },
  { name: "San Jose", lat: 37.305, lng: -121.885, anchor: "middle" },
];

const radius = (seats: number) => 5 + Math.sqrt(seats) * 2;

export default function BayMap({
  dots,
  latestId,
  merged,
}: {
  dots: MapDot[];
  latestId: string | null;
  merged: boolean;
}) {
  const members = dots.filter((d) => d.state === "member");
  const seatSum = members.reduce((s, d) => s + d.seats, 0);
  const hub: [number, number] | null =
    merged && members.length
      ? [
          members.reduce((s, d) => s + px(d.lat, d.lng)[0] * d.seats, 0) / seatSum,
          members.reduce((s, d) => s + px(d.lat, d.lng)[1] * d.seats, 0) / seatSum,
        ]
      : null;
  const latest = latestId ? dots.find((d) => d.id === latestId) : undefined;

  return (
    <div className="relative aspect-[640/560] w-full max-w-[680px] overflow-hidden rounded-lg border border-line bg-white">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Map of startups placing orders around the San Francisco Bay Area"
      >
        <path d={toPath(OCEAN)} fill="#eef3f7" />
        <path d={toPath(BAY)} fill="#eef3f7" />
        {PLACES.map((p) => {
          const [x, y] = px(p.lat, p.lng);
          return (
            <text key={p.name} x={x} y={y} textAnchor={p.anchor ?? "start"} fontSize="11" fill="#8f98a2">
              {p.name}
            </text>
          );
        })}

        {hub &&
          members.map((d) => {
            const [x, y] = px(d.lat, d.lng);
            const len = Math.hypot(hub[0] - x, hub[1] - y);
            return (
              <line
                key={`l-${d.id}`}
                className="dm-line"
                style={{ ["--len" as string]: len.toFixed(0) }}
                x1={x}
                y1={y}
                x2={hub[0]}
                y2={hub[1]}
                stroke="#059669"
                strokeOpacity="0.55"
                strokeWidth="1.25"
              />
            );
          })}

        {dots.map((d) => {
          const [x, y] = px(d.lat, d.lng);
          const r = radius(d.seats);
          const excluded = d.state === "excluded";
          const member = d.state === "member";
          return (
            <g key={d.id}>
              {d.id === latestId && !merged && (
                <circle className="dm-ring" cx={x} cy={y} r={r} fill="none" stroke="#059669" strokeWidth="1.5" />
              )}
              <circle
                className="dm-pop dm-dot"
                cx={x}
                cy={y}
                r={r}
                fill={excluded ? "#94a3b8" : "#10b981"}
                fillOpacity={excluded ? 0.4 : member ? 0.7 : 0.5}
                stroke={excluded ? "#64748b" : "#059669"}
                strokeWidth={member ? 2 : 1.5}
                strokeDasharray={excluded ? "3 2.5" : undefined}
              >
                <title>{`${d.name} · ${d.detail}`}</title>
              </circle>
            </g>
          );
        })}

        {hub && (
          <g className="dm-pop" style={{ animationDelay: "0.6s" }}>
            <circle cx={hub[0]} cy={hub[1]} r="22" fill="#059669" />
            <circle cx={hub[0]} cy={hub[1]} r="29" fill="none" stroke="#059669" strokeOpacity="0.35" strokeWidth="1.5" />
            <text x={hub[0]} y={hub[1] + 6} textAnchor="middle" fontSize="18" fontWeight="600" fill="#fff" className="tabular">
              {members.length}
            </text>
          </g>
        )}
      </svg>

      {latest &&
        !merged &&
        (() => {
          const [x, y] = px(latest.lat, latest.lng);
          const flip = x / W > 0.6;
          return (
            <div
              key={latest.id}
              className="dm-fade pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] leading-tight shadow-sm"
              style={{
                left: `${(x / W) * 100}%`,
                top: `${(y / H) * 100}%`,
                transform: flip ? "translate(calc(-100% - 18px), -50%)" : "translate(18px, -50%)",
              }}
            >
              <div className="font-semibold text-ink">{latest.name}</div>
              <div className="text-muted">{latest.detail}</div>
            </div>
          );
        })()}

      {hub && (
        <div
          className="dm-fade pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-[12px] font-semibold leading-tight text-white"
          style={{ left: `${(hub[0] / W) * 100}%`, top: `${(hub[1] / H) * 100}%`, transform: "translate(40px, -50%)", animationDelay: "0.7s" }}
        >
          One group request
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded-md border border-line bg-white/90 px-2.5 py-1.5 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-accent bg-accent/60" />
          Buyer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-[#64748b] bg-[#94a3b8]/40" />
          Left out
        </span>
        <span className="text-faint">Size = seats</span>
      </div>
    </div>
  );
}
