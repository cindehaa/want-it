"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import type { Order, PoolView } from "@/lib/contracts";
import { usdSeat } from "./format";

type Kind = "pooled" | "deal" | "over" | "list" | "excluded";

const REASONS: Record<string, string> = {
  wrong_category: "Wrong category",
  deadline_before_window: "Deadline is before the pooling window closes",
  canceled: "Canceled by the buyer",
};

const STATUS_LABEL: Record<Order["status"], string> = {
  held: "Card held",
  pooled: "In pool",
  negotiating: "In pool, negotiating",
  deal_applied: "Group price applied",
  list_price: "Pays list price",
  canceled_over_max: "Canceled: price above their max",
  canceled_by_buyer: "Canceled by the buyer",
  charged: "Charged at final price",
};

function classify(o: Order, exclusion: string | undefined): Kind {
  if (exclusion) return "excluded";
  switch (o.status) {
    case "deal_applied":
    case "charged":
      return "deal";
    case "canceled_over_max":
      return "over";
    case "list_price":
      return "list";
    case "canceled_by_buyer":
      return "excluded";
    default:
      return "pooled";
  }
}

function sizeFor(seats: number): number {
  return Math.round(Math.min(46, Math.max(14, 10 + Math.sqrt(seats) * 3.6)));
}

function makeIcon(kind: Kind, size: number, you: boolean, joining: boolean): L.DivIcon {
  const cls = ["wi-marker", `wi-marker--${kind}`, you ? "wi-marker--you" : "", joining ? "wi-marker--join" : ""]
    .filter(Boolean)
    .join(" ");
  const check =
    kind === "deal" && size >= 20
      ? `<svg viewBox="0 0 16 16" width="${Math.round(size * 0.5)}" height="${Math.round(size * 0.5)}" style="position:absolute;inset:0;margin:auto" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>`
      : "";
  const label = you ? `<span class="wi-you-label">You</span>` : "";
  return L.divIcon({
    className: "wi-icon",
    html: `<div class="${cls}" style="width:${size}px;height:${size}px">${check}${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function DemandMap({ view }: { view: PoolView }) {
  const { orders, pool } = view;
  const exclusionById = useMemo(() => new Map(pool.exclusions.map((e) => [e.orderId, e.reason])), [pool.exclusions]);

  // Only animate markers that join the pool after the first render (real state change).
  const seenPooled = useRef<Set<string> | null>(null);
  const [joining, setJoining] = useState<Set<string>>(new Set());
  const pooledKey = orders
    .filter((o) => classify(o, exclusionById.get(o.id)) === "pooled")
    .map((o) => o.id)
    .sort()
    .join(",");
  useEffect(() => {
    const current = new Set(pooledKey ? pooledKey.split(",") : []);
    if (seenPooled.current === null) {
      seenPooled.current = current;
      return;
    }
    const fresh = [...current].filter((id) => !seenPooled.current!.has(id));
    seenPooled.current = current;
    if (fresh.length === 0) return;
    setJoining((prev) => new Set([...prev, ...fresh]));
    const t = setTimeout(() => {
      setJoining((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.delete(id));
        return next;
      });
    }, 1700);
    return () => clearTimeout(t);
  }, [pooledKey]);

  const iconCache = useRef(new Map<string, L.DivIcon>());
  const iconFor = (kind: Kind, size: number, you: boolean, join: boolean) => {
    const key = `${kind}|${size}|${you}|${join}`;
    let icon = iconCache.current.get(key);
    if (!icon) {
      icon = makeIcon(kind, size, you, join);
      iconCache.current.set(key, icon);
    }
    return icon;
  };

  // Fit the first render to the buyers we know about; later moves are the user's.
  const initialBounds = useRef<L.LatLngBoundsExpression | null>(null);
  if (initialBounds.current === null) {
    const pts = orders.map((o) => [o.lat, o.lng] as [number, number]);
    initialBounds.current = pts.length ? L.latLngBounds(pts) : L.latLngBounds([[37.2, -122.5], [38.0, -121.8]]);
  }

  const present = new Set<Kind>(orders.map((o) => classify(o, exclusionById.get(o.id))));
  const hasYou = orders.some((o) => !o.isSimulated);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        bounds={initialBounds.current}
        boundsOptions={{ padding: [36, 36], maxZoom: 10 }}
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {orders.map((o) => {
          const reason = exclusionById.get(o.id);
          const kind = classify(o, reason);
          const you = !o.isSimulated;
          const icon = iconFor(kind, sizeFor(o.seats), you, joining.has(o.id));
          return (
            <Marker
              key={o.id}
              position={[o.lat, o.lng]}
              icon={icon}
              zIndexOffset={you ? 1000 : kind === "excluded" ? -100 : Math.round(1000 - sizeFor(o.seats) * 10)}
              keyboard={false}
            >
              <Tooltip direction="top" offset={[0, -(sizeFor(o.seats) / 2) - 4]} className="wi-tooltip" opacity={1}>
                <div className="min-w-[160px]">
                  <div className="font-semibold">{you ? `${o.buyerName} (You)` : o.buyerName}</div>
                  <div className="text-[11px] text-[#5f6a75]">
                    {o.isSimulated ? "Simulated buyer" : "Live buyer"} in {o.city}
                  </div>
                  <div className="mt-1">
                    {o.seats} seats
                    {o.maxPricePerSeatCents != null ? `, max ${usdSeat(o.maxPricePerSeatCents)}/seat` : ", no max price"}
                  </div>
                  {reason ? (
                    <div className="mt-1 font-medium text-[#475569]">Excluded: {REASONS[reason] ?? reason}</div>
                  ) : (
                    <div className="mt-1 font-medium">
                      {STATUS_LABEL[o.status]}
                      {o.finalPricePerSeatCents != null ? ` at ${usdSeat(o.finalPricePerSeatCents)}/seat` : ""}
                    </div>
                  )}
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-6 left-2 z-[500] flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-white/90 px-2.5 py-1.5 text-[11px] text-muted shadow-sm">
        <LegendItem cls="wi-marker--pooled" label="Pooled" />
        {present.has("deal") && <LegendItem cls="wi-marker--deal" label="Group price" />}
        {present.has("over") && <LegendItem cls="wi-marker--over" label="Over their max" />}
        {present.has("list") && <LegendItem cls="wi-marker--list" label="List price" />}
        <LegendItem cls="wi-marker--excluded" label="Excluded" />
        {hasYou && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink" />
            You
          </span>
        )}
        <span className="text-faint">Size = seats</span>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-[500] rounded-md border border-line bg-white/90 px-2 py-1 text-[11px] text-muted shadow-sm">
        Simulated buyers are labeled
      </div>
    </div>
  );
}

function LegendItem({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`wi-marker ${cls} inline-block !h-2.5 !w-2.5 !shadow-none`} />
      {label}
    </span>
  );
}
