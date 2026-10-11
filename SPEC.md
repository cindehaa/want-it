# want-it — SPEC (a16z SpeedHacks, Oct 11 2026)

**Theme:** "Give people their time back." Judges see the product + a 4–5 min video, not the code.
**Hard times (PT):** freeze 3:45 · record 4:00 · upload by 4:30 · submission cutoff 5:00.

## 1. Thesis

**"Buy like you have a procurement team."** Big companies have procurement teams that find vendors, get quotes, and negotiate. Startups don't — each founder repeats the same research, "contact sales" calls, and haggling alone.

want-it: a startup buys software the normal way (checkout, done, leave). Under the hood the marketplace **pools demand across startups** and an **AI agent phones vendors (Dial) to negotiate a group price**, using **demand evidence from Keewano** as leverage. **Your price can only go down.**

Pitch line: *a limit order with bargaining power.* A price-watch agent waits for a price to exist; we create the price by bringing demand together.

## 2. Settled decisions

| Topic | Decision |
|---|---|
| Mechanism | **Pooled purchasing power.** Vendors quote tiered group prices. |
| Demo category | **SOC 2 compliance software seats.** No shipping. Vendors are **fictional test vendors** "Certly" and "Vantly", always labeled "test vendor". |
| Vendor side of the call | **A Dial AI agent answers as the vendor** (Dial number B with `inboundInstruction` = vendor persona + private pricing policy; PATCHed per vendor before each call). Our buyer agent (number A) does not know the floors, so the haggling is real. UI shows the vendor's private policy, labeled "simulated vendor (AI agent)". Fallback `VENDOR_MODE=human`: teammate answers as Certly, Cindy as Vantly. |
| Software delivery | Group the **deal**, not the account. Each buyer gets their own account via a per-buyer redemption link at the group price. We never hold or share credentials. |
| Buyer UX | Normal checkout → "Order confirmed" instantly. Card **hold** (simulated, labeled), not a charge. Captured at final price when the deal lands or the window closes. |
| Max price | Optional "only buy if ≤ $X/seat". Hold = min(list, max). If final price > max → order auto-canceled, hold released. These buyers are the vendor's *incremental* demand. |
| Buyer input | Need (category, seats, optional max price) + optional preferred vendor. Open vendor ⇒ marketplace compares vendors. |
| Negotiation | Dial outbound calls. V1: one call to Certly. V2: call Vantly with Certly's extracted quote ("can you beat $X?"). V3 (stretch): call back Certly. Each call's prompt is built from real prior extracted quotes. |
| Supplier value | Incremental customers who abandoned at list price (Keewano proves it) + lower cost of sale (1 call closes N accounts) + committed demand (cards already held) + first-year-only discount. If none holds, vendor says no → "No better deal", buyers pay list. |
| Stack | Next.js (App Router) + TypeScript + Tailwind + SQLite (better-sqlite3) + Zod. Local only (`pnpm dev`). Leaflet (OSM tiles) map, Recharts curve. Anthropic `claude-sonnet-5-5` for quote extraction. |
| Clock | One **app clock** (`lib/clock.ts`, real time + DB-stored offset). Every deadline/hold reads it. Demo controls can fast-forward. Labeled "Demo clock". |
| Darwin, Sparta, real Stripe, auth, deploy | Out of scope. |
| Synthetic data | ~14 simulated startups (labeled "simulated buyer"), synthetic Keewano history (labeled). The live demo buyer is real; the Dial calls are real. |

## 3. Truthful states

**Order:** `held` → `pooled` → `negotiating` → one of `deal_applied` | `list_price` | `canceled_over_max` | `canceled_by_buyer` → `charged` (simulated capture).
**Pool:** `open` → `negotiating` → `deal_found` | `no_deal` → `settled`.
**Call:** `queued` → `in_progress` → `ended` → `transcribed` → `extracted` | `failed`. Field `source: 'live' | 'recorded_replay'` (replay shows recorded timestamp).
**Quote:** always `supplier_stated` with transcript evidence. Our asking price is never a quote.

## 4. Matching & settlement rules (deterministic — no AI)

- **Pool membership:** same `category`; order status `held`/`pooled`; buyer deadline ≥ pool window close; not canceled. Preferred-vendor orders only count toward that vendor's quote. Excluded orders listed with a reason (`wrong_category`, `deadline_before_window`, `canceled`).
- **Count each order once** (latest version). Idempotency key on `POST /api/orders`.
- **Effective price** for vendor quote q at pool size S seats: `tierPrice(q, S) + perAccountFee / seatsOfOrder`. Pick the best quote (lowest effective price) among quotes that confirm separate accounts.
- **Per order:** `cap = min(list, max ?? list)`. If best effective price ≤ cap and < list → `deal_applied` at that price. If no quote beats list and (no max or max ≥ list) → `list_price`. Else → `canceled_over_max`.
- **Known edge case (not handled in MVP, answer if asked):** dropping over-max buyers shrinks S, which can drop the tier and push out more buyers. Fix: iterate settlement until membership is stable (fixed point), then show final prices. MVP does a single pass; demo data doesn't trigger it.
- Money is integer cents, USD, per seat unless named `total`.

## 5. Data contracts — `lib/contracts.ts` (Zod; owned by Lead; changes announced in `WIP/LOG.md`)

```ts
Order { id, idempotencyKey, buyerName, isSimulated, category: 'soc2_compliance',
  seats, maxPricePerSeatCents: number|null, preferredVendorId: string|null,
  lat, lng, city, deadline: ISO, holdAmountCents, status, finalPricePerSeatCents: number|null,
  redemptionLink: string|null, poolId: string|null, createdAt, updatedAt }
Vendor { id, name, isTestVendor: true, listPricePerSeatCents }        // phone stays server-side env
Pool { id, category, windowClosesAt, status, memberOrderIds[], exclusions[{orderId, reason}], totalSeats }
Call { id, poolId, vendorId, sequence, dialCallId, status, source, recordedAt|null,
  instruction, transcriptTurns[{speaker, text, startMs}], startedAt, endedAt }
Quote { id, callId, vendorId, tiers[{minSeats, pricePerSeatCents}], perAccountFeeCents,
  separateAccountsConfirmed: boolean|null, expiresAt|null, conditions[], evidence: string }
DemandEvidence { source: 'keewano_live'|'keewano_cached'|'unavailable', queryText, ranAt,
  interestedBuyers90d, abandonedOverPrice90d, medianMaxPricePerSeatCents|null, summary }
Benchmark { steps[{id, label, baselineMinutesPerBuyer, ourMinutesPerBuyer, kind: 'observed'|'estimate', note}] ,
  vendorSalesMinutesPerCustomer, kindNote }
```

## 6. API (Next.js route handlers)

| Route | Purpose |
|---|---|
| `POST /api/orders` | Checkout. Body: need + max + preferred vendor + idempotencyKey. Returns Order (status `held`). Fires `recordEvent('order_placed')`. |
| `GET /api/orders/:id` | Order + its pool summary. |
| `POST /api/orders/:id/cancel` | Buyer withdraws (only before settle). |
| `GET /api/pool` | Current pool view: members, exclusions, demand curve, calls, quotes, evidence, time saved, clock. |
| `POST /api/pool/negotiate` | Starts next call in sequence (Certly → Vantly → Certly). Returns Call. |
| `GET /api/calls/:id` | Poll Dial; on transcribed → run extraction → Quote. |
| `POST /api/pool/settle` | Apply rules in §4, update orders, simulated capture. |
| `POST /api/demo/clock` `{advanceHours}` / `POST /api/demo/reset` | Demo controls (demo mode only). |

Dial: `POST https://api.getdial.ai/api/v1/calls` (try `/v1/calls` if 404), Bearer key, `{to, outboundInstruction, maxCallDurationSeconds: 180}`; poll `GET /api/v1/calls/{id}` for `transcriptTurns` (no webhooks — we're on localhost).

## 7. Screens (only three visuals on the pool screen)

1. **Storefront `/`** — SOC 2 software need form: seats, optional max $/seat, optional preferred vendor; "Place order (simulated card hold)". No card-number field.
2. **Order `/orders/[id]`** — "Order confirmed. You'll pay at most $X." Status timeline; price-drop banner; redemption link when deal applied; cancel button.
3. **Pool `/pool`** (marketplace view): **(a)** demand map (startups as dots, light up when pooled; excluded dots greyed with reason), **(b)** demand/price curve (max-price distribution + vendor tiers + marker at current seats), **(c)** time-saved counter. Side panel: Keewano evidence card, call panel with live transcript + extracted quote cards. Demo clock controls in a corner.

## 8. Time saved (the core claim)

Same outcome compared: *a startup obtains a negotiated price for SOC 2 software.*
- Baseline per buyer: find/compare vendors, contact sales + book call, sales call + quote, negotiate/follow-up, checkout.
- With us per buyer: checkout only (timed live). Agents do compare/call/negotiate.
- **Net human minutes saved = N × baselinePerBuyer − N × ourPerBuyer.** Vendor side shown separately: `N sales cycles` vs `k agent calls`.
- Agent call minutes, waiting time (window), and money saved shown **separately**, never as human time.
- Every number tagged `observed` or `estimate`. Scale projection labeled "projection".
- Source of numbers: `data/benchmark.json` (owned by teammate).

## 9. Acceptance tests (must pass before freeze)

1. A wrong-category or too-early-deadline order is excluded with a visible reason.
2. Same idempotency key posted twice → one order.
3. Buyer cancels → pool seats and curve update; canceled order never charged.
4. Quote above a buyer's max → that order `canceled_over_max`, hold released.
5. No quote beats list → `list_price`, nobody charged more than list.
6. Dial failure/timeout → call `failed`, UI says so; replay is labeled `recorded_replay` with its timestamp.
7. Keewano unavailable → evidence card says "unavailable", negotiation still works.

## 10. Later (not today)

Physical goods (per-address fee already in the price math; consolidation hub), real Stripe manual capture, fixed-point settlement, vendor portal, Darwin agent-job category, subscriptions, real vendor partnerships.

## 11. Demo script (draft, ~4.5 min) — owned by teammate in `demo/SCRIPT.md`

1. Problem (40s): founder needs SOC 2 tool → 4 hours of sales calls & haggling. Big cos have procurement; startups don't.
2. Live order (40s): Cindy places an order with a max price, gets "Order confirmed" in ~30s, leaves.
3. Pool (40s): map lights up — 14 simulated startups, 2 excluded with reasons. Keewano query: "N abandoned over price in 90 days."
4. Negotiation (90s): Dial calls Certly live → transcript → quote; Dial calls Vantly with Certly's quote → better quote.
5. Settle (30s): fast-forward demo clock → prices drop, one over-max buyer canceled, redemption links.
6. Time saved (30s): counter + vendor side + labeled projection. Tech: Dial, Keewano, Next.js.
