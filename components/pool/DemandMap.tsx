"use client";

import "leaflet/dist/leaflet.css";
import "./market.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import type { Order, PoolView } from "@/lib/contracts";
import { usdSeat } from "./format";

type Kind = "pooled" | "excluded";

const REASONS: Record<string, string> = {
  wrong_category: "Excluded, wrong category",
  deadline_before_window: "Excluded, deadline before the window closes",
  canceled: "Excluded, canceled",
};

const STATUS_LABEL: Record<Order["status"], string> = {
  held: "Card held",
  pooled: "In the pool",
  negotiating: "In the pool, negotiating",
  deal_applied: "Group price applied",
  list_price: "Pays list price",
  canceled_over_max: "Canceled, price above their max",
  canceled_by_buyer: "Canceled by the buyer",
  charged: "Charged at the final price",
};

function classify(o: Order, exclusion: string | undefined): Kind {
  if (exclusion || o.status === "canceled_by_buyer" || o.status === "canceled_over_max") return "excluded";
  return "pooled";
}

/** About 20px for 6 seats up to about 40px for 45 seats, as in the mockup. */
function sizeFor(seats: number): number {
  return Math.round(Math.min(44, Math.max(18, 12 + Math.sqrt(seats) * 4.2)));
}

function makeIcon(kind: Kind, size: number, you: boolean, joining: boolean): L.DivIcon {
  const cls = ["mf-dot", `mf-dot--${kind}`, you ? "mf-dot--you" : "", joining ? "mf-dot--join" : ""].filter(Boolean).join(" ");
  const label = you ? `<span class="mf-you-label">You</span>` : "";
  return L.divIcon({
    className: "mf-icon",
    html: `<div class="${cls}" style="width:${size}px;height:${size}px">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** The stage: a full-bleed, light map with one dot per buyer (real lat/lng, sized by seats). */
export default function DemandMap({ view }: { view: PoolView }) {
  const { orders, pool } = view;
  const exclusionById = useMemo(() => new Map(pool.exclusions.map((e) => [e.orderId, e.reason])), [pool.exclusions]);

  // Ripple only for buyers who join the pool after first paint (a real state change).
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
    }, 1600);
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

  // Fit once to the buyers we know about; after that the map belongs to the viewer.
  const initialBounds = useRef<L.LatLngBoundsExpression | null>(null);
  if (initialBounds.current === null) {
    const pts = orders.map((o) => [o.lat, o.lng] as [number, number]);
    initialBounds.current = pts.length ? L.latLngBounds(pts) : L.latLngBounds([[37.2, -122.5], [38.0, -121.8]]);
  }

  return (
    <MapContainer
      bounds={initialBounds.current}
      boundsOptions={{ paddingTopLeft: [40, 110], paddingBottomRight: [40, 170], maxZoom: 10 }}
      scrollWheelZoom
      className="mf-map h-full w-full"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {orders.map((o) => {
        const reason = exclusionById.get(o.id);
        const kind = classify(o, reason);
        const you = !o.isSimulated;
        const size = sizeFor(o.seats);
        return (
          <Marker
            key={o.id}
            position={[o.lat, o.lng]}
            icon={iconFor(kind, size, you, joining.has(o.id))}
            zIndexOffset={you ? 1000 : kind === "excluded" ? -100 : Math.round(500 - size * 5)}
            keyboard={false}
          >
            <Tooltip direction="top" offset={[0, -(size / 2) - (you ? 22 : 4)]} className="mf-tooltip" opacity={1}>
              <div className="min-w-[150px]">
                <div className="font-semibold">{you ? `${o.buyerName} (You)` : o.buyerName}</div>
                <div className="text-[11px] text-[#5f6a75]">
                  {o.isSimulated ? "Simulated buyer" : "Live buyer"}, {o.seats} seats, {o.city}
                </div>
                <div className="mt-1 font-medium">
                  {reason ? (REASONS[reason] ?? `Excluded, ${reason}`) : STATUS_LABEL[o.status]}
                  {!reason && o.finalPricePerSeatCents != null ? ` at ${usdSeat(o.finalPricePerSeatCents)}/seat` : ""}
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
