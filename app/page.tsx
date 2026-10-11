"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VENDORS, listPriceFor } from "@/lib/vendors";

const LIST_CENTS = listPriceFor("soc2_compliance", null);
const money = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
const field =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20";

export default function Storefront() {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID()); // once per form mount
  const [company, setCompany] = useState("");
  const [seats, setSeats] = useState("10");
  const [useMax, setUseMax] = useState(false);
  const [maxDollars, setMaxDollars] = useState("24");
  const [vendor, setVendor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seatsN = Math.floor(Number(seats));
  const maxCents = useMax ? Math.round(Number(maxDollars) * 100) : null;
  const seatsOk = Number.isFinite(seatsN) && seatsN >= 1 && seatsN <= 500;
  const maxOk = !useMax || (Number.isFinite(maxCents) && (maxCents as number) > 0);
  const vendorList = vendor ? (VENDORS.find((v) => v.id === vendor)?.listPricePerSeatCents ?? LIST_CENTS) : LIST_CENTS;
  const holdTotal = seatsOk && maxOk ? seatsN * Math.min(vendorList, maxCents ?? vendorList) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!company.trim()) return setError("Please enter your company name.");
    if (!seatsOk) return setError("Seats must be between 1 and 500.");
    if (!maxOk) return setError("Enter a max price above $0, or turn the limit off.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          buyerName: company.trim(),
          category: "soc2_compliance",
          seats: seatsN,
          maxPricePerSeatCents: maxCents,
          preferredVendorId: vendor || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong placing your order.");
      router.push(`/orders/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong placing your order.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5">
        <span className="text-lg font-semibold tracking-tight">
          want<span className="text-emerald-600">-it</span>
        </span>
        <Link href="/pool" className="text-sm text-zinc-500 hover:text-emerald-700">
          Marketplace view
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-10">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Buy like you have a procurement team.</h1>
        <p className="mt-3 text-base text-zinc-600 sm:text-lg">
          Check out like normal. We pool demand across startups and an AI agent negotiates a group price with vendors.{" "}
          <span className="font-medium text-zinc-900">Your price can only go down.</span>
        </p>

        <form onSubmit={submit} className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-lg font-semibold">SOC 2 compliance software</h2>
              <p className="mt-0.5 text-sm text-zinc-500">Per-seat plan. Delivered as your own account via a redemption link.</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold">{money(LIST_CENTS)}</div>
              <div className="text-xs text-zinc-500">per seat · list price</div>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Company name</span>
              <input className={field} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Inc." autoComplete="organization" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Seats</span>
              <input className={field} type="number" inputMode="numeric" min={1} max={500} value={seats} onChange={(e) => setSeats(e.target.value)} />
            </label>

            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-zinc-300 accent-emerald-600"
                  checked={useMax}
                  onChange={(e) => setUseMax(e.target.checked)}
                />
                <span className="text-sm font-medium">Only buy if I can get it for ≤ ${useMax ? (maxDollars || "__") : "__"}/seat</span>
              </label>
              {useMax && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-zinc-500">$</span>
                  <input
                    className={`${field} max-w-32`}
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="any"
                    value={maxDollars}
                    onChange={(e) => setMaxDollars(e.target.value)}
                    aria-label="Maximum price per seat in dollars"
                  />
                  <span className="text-sm text-zinc-500">per seat</span>
                </div>
              )}
              {useMax && <p className="mt-2 text-xs text-zinc-500">If the final group price is above this, your order is canceled automatically and the hold is released.</p>}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Preferred vendor</span>
              <select className={field} value={vendor} onChange={(e) => setVendor(e.target.value)}>
                <option value="">Any — let us compare</option>
                {VENDORS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (test vendor)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="flex items-center justify-between">
              <span>You&apos;ll pay at most</span>
              <span className="text-base font-semibold">{holdTotal != null ? money(holdTotal) : "—"}</span>
            </div>
            <p className="mt-1 text-xs text-emerald-800/80">
              A simulated card hold, not a charge. No card details are collected. The price can only go down from here.
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Placing order…" : "Place order — simulated card hold"}
          </button>
          <p className="mt-3 text-center text-xs text-zinc-500">Certly and Vantly are fictional test vendors for this demo.</p>
        </form>
      </main>
    </div>
  );
}
