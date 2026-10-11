// The single app clock. Every deadline and hold reads now(). Demo controls fast-forward via an offset.
import { kvGet, kvSet } from "@/lib/db";

export function clockOffsetHours(): number {
  return Number(kvGet("clockOffsetHours") ?? "0");
}

export function now(): Date {
  return new Date(Date.now() + clockOffsetHours() * 3600_000);
}

export function advanceClock(hours: number) {
  kvSet("clockOffsetHours", String(clockOffsetHours() + hours));
}

export const isDemoMode = () => process.env.DEMO_MODE !== "0";
