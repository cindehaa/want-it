/**
 * want-it acceptance tests (SPEC §9).
 *
 *   PORT=3103 DB_PATH=/tmp/want-it-acceptance.db pnpm dev           # terminal 1 (never port 3000)
 *   BASE_URL=http://localhost:3103 DB_PATH=/tmp/want-it-acceptance.db pnpm tsx scripts/acceptance.ts
 *
 * - Black-box checks run over HTTP against BASE_URL (default http://localhost:3103).
 *   POST /api/demo/reset runs before every scenario, so this WIPES the target server's DB.
 *   It refuses to run against port 3000 (the demo DB) unless ALLOW_DEMO_DB=1.
 * - Settlement rules (SPEC §4 / acceptance 4 & 5) are unit-tested by importing `settleOrders`
 *   directly with constructed Order/Quote objects (no DB, no server needed).
 * - If DB_PATH is set (same file the server uses), an extra end-to-end scenario inserts a
 *   fixture call+quote straight into SQLite and drives POST /api/pool/settle.
 * - Live Dial / Anthropic / Keewano are never called. The live-mode negotiate check is
 *   skipped when Dial keys look configured (it would place a real call).
 *
 * Output: PASS/FAIL/SKIP per check; exit code 1 if any check FAILs.
 */
import fs from "node:fs";
import path from "node:path";
import { settleOrders, type Settlement } from "@/lib/settle";
import { Order as OrderSchema, Quote as QuoteSchema } from "@/lib/contracts";
import type { Order, Quote, PoolView, Vendor, Call } from "@/lib/contracts";

const BASE = (process.env.BASE_URL ?? "http://localhost:3103").replace(/\/+$/, "");
const DB_PATH = process.env.DB_PATH;

// ---------------------------------------------------------------------------------------------
// tiny harness
// ---------------------------------------------------------------------------------------------
let nPass = 0;
let nFail = 0;
let nSkip = 0;
let scenarioLabel = "";

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    nPass++;
    console.log(`  PASS  ${scenarioLabel} ${name}`);
  } else {
    nFail++;
    console.log(`  FAIL  ${scenarioLabel} ${name}${detail ? `\n          -> ${detail}` : ""}`);
  }
}
function skip(name: string, why: string) {
  nSkip++;
  console.log(`  SKIP  ${scenarioLabel} ${name} (${why})`);
}
function note(msg: string) {
  console.log(`  NOTE  ${scenarioLabel} ${msg}`);
}
const j = (v: unknown) => JSON.stringify(v);
function eq<T>(name: string, actual: T, expected: T) {
  check(name, j(actual) === j(expected), `expected ${j(expected)}, got ${j(actual)}`);
}

async function scenario(label: string, title: string, fn: () => Promise<void> | void) {
  scenarioLabel = `[${label}]`;
  console.log(`\n${scenarioLabel} ${title}`);
  try {
    await fn();
  } catch (e) {
    nFail++;
    console.log(`  FAIL  ${scenarioLabel} scenario threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------------------------
type ApiError = { error: string };
type OrderView = { order: Order };
type Res<T = unknown> = { status: number; json: T; text: string };

async function api<T = unknown>(method: "GET" | "POST", p: string, body?: unknown): Promise<Res<T>> {
  const res = await fetch(BASE + p, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(90_000), // first hit of a route compiles it in dev
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json: json as T, text };
}

async function reset(): Promise<PoolView> {
  const r = await api<PoolView>("POST", "/api/demo/reset");
  if (r.status !== 200) throw new Error(`POST /api/demo/reset -> ${r.status} ${r.text.slice(0, 200)}`);
  return r.json;
}
async function view(): Promise<PoolView> {
  const r = await api<PoolView>("GET", "/api/pool");
  if (r.status !== 200) throw new Error(`GET /api/pool -> ${r.status} ${r.text.slice(0, 200)}`);
  return r.json;
}

let keySeq = 0;
const uniqueKey = (tag: string) => `acc-${tag}-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

function orderBody(over: Record<string, unknown> = {}) {
  return {
    idempotencyKey: uniqueKey("ord"),
    buyerName: "Acceptance Buyer",
    category: "soc2_compliance",
    seats: 7,
    maxPricePerSeatCents: null,
    preferredVendorId: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------
// fixtures for settleOrders (checks 4 & 5)
// ---------------------------------------------------------------------------------------------
const T0 = "2026-10-11T12:00:00.000Z";
const LIST_CERTLY = 3000; // lib/vendors.ts
const LIST_VANTLY = 3200;
const LIST_ANY = Math.min(LIST_CERTLY, LIST_VANTLY); // list price a no-preference buyer sees

let seq = 0;
function mkOrder(id: string, seats: number, o: Partial<Order> = {}): Order {
  return OrderSchema.parse({
    id,
    idempotencyKey: `fixture-${id}-${seq++}`,
    buyerName: id,
    isSimulated: true,
    category: "soc2_compliance",
    seats,
    maxPricePerSeatCents: null,
    preferredVendorId: null,
    lat: 37.77,
    lng: -122.41,
    city: "San Francisco",
    deadline: "2026-12-01T00:00:00.000Z",
    holdAmountCents: 0,
    status: "negotiating",
    finalPricePerSeatCents: null,
    redemptionLink: null,
    poolId: "pool_soc2",
    createdAt: T0,
    updatedAt: T0,
    ...o,
  });
}
function mkQuote(
  vendorId: "certly" | "vantly",
  tiers: Array<[minSeats: number, priceCents: number]>,
  opts: { fee?: number; sep?: boolean | null } = {},
): Quote {
  return QuoteSchema.parse({
    id: `q-${vendorId}-${seq++}`,
    callId: `call-${vendorId}`,
    vendorId,
    tiers: tiers.map(([minSeats, pricePerSeatCents]) => ({ minSeats, pricePerSeatCents })),
    perAccountFeeCents: opts.fee ?? 0,
    separateAccountsConfirmed: opts.sep === undefined ? true : opts.sep,
    expiresAt: null,
    conditions: [],
    evidence: "fixture",
    status: "supplier_stated",
    createdAt: T0,
  });
}
function settle(members: Order[], quotes: Quote[]) {
  const out = settleOrders(members, quotes);
  const by = new Map<string, Settlement>(out.map((s) => [s.orderId, s]));
  return { out, get: (id: string) => by.get(id)! };
}
function expectSettlement(label: string, s: Settlement | undefined, status: Order["status"], price: number | null, vendorId?: string | null) {
  if (!s) return check(label, false, "no settlement returned for this order");
  const ok = s.status === status && s.pricePerSeatCents === price && (vendorId === undefined || s.vendorId === vendorId);
  check(label, ok, `expected ${status} @ ${price}${vendorId !== undefined ? ` via ${vendorId}` : ""}, got ${s.status} @ ${s.pricePerSeatCents} via ${s.vendorId}`);
}

// ---------------------------------------------------------------------------------------------
// misc helpers
// ---------------------------------------------------------------------------------------------
const SOURCES = ["keewano_live", "keewano_cached", "unavailable"];

function readEnvFileKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of [".env.local", ".env"]) {
    let txt = "";
    try {
      txt = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    } catch {
      continue;
    }
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
      if (v && !(m[1] in out)) out[m[1]] = v;
    }
  }
  return out;
}
const dialKeysLookConfigured = () => !!(process.env.DIAL_API_KEY?.trim() || readEnvFileKeys().DIAL_API_KEY);

function recordedCallsFor(vendorId: string): number {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "recorded-calls.json"), "utf8"));
    return Array.isArray(raw) ? raw.filter((r) => r?.vendorId === vendorId).length : 0;
  } catch {
    return 0;
  }
}

function listFor(vendors: Vendor[], o: Order): number {
  return Math.min(...vendors.filter((v) => v.category === o.category && (!o.preferredVendorId || v.id === o.preferredVendorId)).map((v) => v.listPricePerSeatCents));
}

// ---------------------------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------------------------
async function main() {
  // Safety: reset wipes the target DB.
  try {
    const u = new URL(BASE);
    if (u.port === "3000" && process.env.ALLOW_DEMO_DB !== "1") {
      console.error(`Refusing to run against ${BASE}: POST /api/demo/reset would wipe the demo DB. Use another port or set ALLOW_DEMO_DB=1.`);
      process.exit(2);
    }
  } catch {
    console.error(`Bad BASE_URL: ${BASE}`);
    process.exit(2);
  }
  console.log(`want-it acceptance tests -> ${BASE}${DB_PATH ? `  (DB_PATH=${DB_PATH})` : ""}`);

  // Reachability
  try {
    await api("GET", "/api/pool");
  } catch (e) {
    console.error(`Cannot reach ${BASE} (${e instanceof Error ? e.message : e}). Start the dev server first: PORT=3103 pnpm dev`);
    process.exit(2);
  }

  // ---- 1. exclusions ------------------------------------------------------------------------
  await scenario("1", "Wrong-category / early-deadline orders are excluded with a visible reason", async () => {
    const v = await reset();
    const windowClose = new Date(v.pool.windowClosesAt).getTime();
    const wrongCat = v.orders.filter((o) => o.category !== v.pool.category);
    const early = v.orders.filter((o) => o.category === v.pool.category && new Date(o.deadline).getTime() < windowClose);
    check("seed has at least one wrong-category order", wrongCat.length >= 1, `orders: ${v.orders.map((o) => `${o.buyerName}:${o.category}`).join(", ")}`);
    check("seed has at least one early-deadline order", early.length >= 1);
    const reasonOf = (id: string) => v.pool.exclusions.find((e) => e.orderId === id)?.reason;
    for (const o of wrongCat) {
      eq(`seeded wrong-category "${o.buyerName}" -> wrong_category`, reasonOf(o.id), "wrong_category");
      check(`"${o.buyerName}" not a pool member`, !v.pool.memberOrderIds.includes(o.id));
    }
    for (const o of early) {
      eq(`seeded early-deadline "${o.buyerName}" -> deadline_before_window`, reasonOf(o.id), "deadline_before_window");
      check(`"${o.buyerName}" not a pool member`, !v.pool.memberOrderIds.includes(o.id));
    }
    // each order counted once; seats consistent with membership
    check("memberOrderIds has no duplicates", new Set(v.pool.memberOrderIds).size === v.pool.memberOrderIds.length);
    const memberSeats = v.orders.filter((o) => v.pool.memberOrderIds.includes(o.id)).reduce((s, o) => s + o.seats, 0);
    eq("pool.totalSeats == sum of member seats", v.pool.totalSeats, memberSeats);
    check("every order is either a member or excluded (exactly one)", v.orders.every((o) => v.pool.memberOrderIds.includes(o.id) !== v.pool.exclusions.some((e) => e.orderId === o.id)));

    // orders placed through the API behave the same
    const wc = await api<Order>("POST", "/api/orders", orderBody({ buyerName: "Wrong Cat Co", category: "dev_tools", seats: 3 }));
    const ed = await api<Order>("POST", "/api/orders", orderBody({ buyerName: "Too Early Co", seats: 4, deadline: new Date(windowClose - 3600_000).toISOString() }));
    check("POST wrong-category order accepted (201)", wc.status === 201, `${wc.status} ${wc.text.slice(0, 200)}`);
    check("POST early-deadline order accepted (201)", ed.status === 201, `${ed.status} ${ed.text.slice(0, 200)}`);
    const v2 = await view();
    eq("API-created wrong-category order -> wrong_category", v2.pool.exclusions.find((e) => e.orderId === wc.json?.id)?.reason, "wrong_category");
    eq("API-created early-deadline order -> deadline_before_window", v2.pool.exclusions.find((e) => e.orderId === ed.json?.id)?.reason, "deadline_before_window");
    eq("excluded orders add no seats to the pool", v2.pool.totalSeats, v.pool.totalSeats);
  });

  // ---- 2. idempotency -----------------------------------------------------------------------
  await scenario("2", "Same idempotencyKey posted twice -> one order", async () => {
    const before = await reset();
    const body = orderBody({ idempotencyKey: uniqueKey("idem"), seats: 5 });
    const r1 = await api<Order>("POST", "/api/orders", body);
    const r2 = await api<Order>("POST", "/api/orders", body);
    check("first POST -> 201", r1.status === 201, `${r1.status} ${r1.text.slice(0, 200)}`);
    check("second POST -> 200/201 (not an error)", r2.status === 200 || r2.status === 201, `${r2.status} ${r2.text.slice(0, 200)}`);
    check("same order id returned", !!r1.json?.id && r1.json?.id === r2.json?.id, `${r1.json?.id} vs ${r2.json?.id}`);
    const after = await view();
    eq("total orders increased by exactly 1", after.orders.length, before.orders.length + 1);
    eq("pool seats increased by exactly 5", after.pool.totalSeats, before.pool.totalSeats + 5);
    eq("order appears exactly once in pool members", after.pool.memberOrderIds.filter((id) => id === r1.json?.id).length, 1);

    // same key, different payload: still the original order, nothing new
    const r3 = await api<Order>("POST", "/api/orders", { ...body, seats: 99, buyerName: "Different Body" });
    check("same key + different body -> original order returned", r3.json?.id === r1.json?.id && r3.json?.seats === 5, `${r3.status} ${r3.text.slice(0, 200)}`);

    // concurrent duplicates (race on the unique index)
    const raceBody = orderBody({ idempotencyKey: uniqueKey("race"), seats: 2 });
    const [a, b] = await Promise.all([api<Order>("POST", "/api/orders", raceBody), api<Order>("POST", "/api/orders", raceBody)]);
    check("concurrent duplicate POSTs return the same id", !!a.json?.id && a.json?.id === b.json?.id, `${a.status}:${a.json?.id} ${b.status}:${b.json?.id}`);
    const after2 = await view();
    eq("concurrent duplicates add exactly one more order", after2.orders.length, after.orders.length + 1);

    // different key => different order
    const r4 = await api<Order>("POST", "/api/orders", orderBody({ idempotencyKey: uniqueKey("other"), seats: 1 }));
    check("different key -> different order", r4.status === 201 && r4.json?.id !== r1.json?.id);
  });

  // ---- 3. cancel ----------------------------------------------------------------------------
  await scenario("3", "Buyer cancels a pooled order", async () => {
    await reset();
    const created = await api<Order>("POST", "/api/orders", orderBody({ buyerName: "Cancel Me Inc", seats: 7, maxPricePerSeatCents: 2000 }));
    const id = created.json?.id;
    check("order created", created.status === 201 && !!id, `${created.status} ${created.text.slice(0, 200)}`);
    check("new order is pooled (held -> pooled)", ["held", "pooled"].includes(created.json?.status ?? ""), `status=${created.json?.status}`);
    const v1 = await view();
    check("order is a pool member before cancel", v1.pool.memberOrderIds.includes(id));

    const c1 = await api<Order>("POST", `/api/orders/${id}/cancel`);
    check("cancel -> 200", c1.status === 200, `${c1.status} ${c1.text.slice(0, 200)}`);
    eq("cancel response status", c1.json?.status, "canceled_by_buyer");
    const v2 = await view();
    eq("pool.totalSeats dropped by the order's seats (7)", v2.pool.totalSeats, v1.pool.totalSeats - 7);
    check("order no longer a pool member", !v2.pool.memberOrderIds.includes(id));
    eq("exclusions has reason 'canceled' for it", v2.pool.exclusions.find((e) => e.orderId === id)?.reason, "canceled");
    eq("GET /api/orders/:id status", (await api<OrderView>("GET", `/api/orders/${id}`)).json?.order?.status, "canceled_by_buyer");

    const c2 = await api<ApiError>("POST", `/api/orders/${id}/cancel`);
    eq("second cancel -> 409", c2.status, 409);
    check("second cancel has an error message", typeof c2.json?.error === "string" && c2.json.error.length > 0);
    eq("cancel unknown order -> 404", (await api("POST", "/api/orders/ord_does_not_exist/cancel")).status, 404);

    // settle: canceled order must never be deal_applied / list_price / charged
    const s = await api<PoolView>("POST", "/api/pool/settle");
    check("settle -> 200", s.status === 200, `${s.status} ${s.text.slice(0, 200)}`);
    const after = (await api<OrderView>("GET", `/api/orders/${id}`)).json?.order;
    eq("after settle: still canceled_by_buyer", after?.status, "canceled_by_buyer");
    check("after settle: never deal_applied/list_price/charged", !["deal_applied", "list_price", "charged"].includes(after?.status));
    eq("after settle: no final price", after?.finalPricePerSeatCents, null);
    eq("after settle: no redemption link", after?.redemptionLink, null);
    const sv = s.json;
    check("after settle: canceled order not in settled pool members", !sv.pool.memberOrderIds.includes(id));

    // post-settle cancel of a settled order is refused (SPEC §6: only before settle)
    const settled = sv.orders.find((o) => ["deal_applied", "list_price", "canceled_over_max"].includes(o.status));
    if (settled) eq(`cancel of settled order (${settled.status}) -> 409`, (await api("POST", `/api/orders/${settled.id}/cancel`)).status, 409);
    else skip("cancel of settled order -> 409", "no settled order found");
  });

  // ---- 4 & 5. settlement rules (unit: settleOrders) ------------------------------------------
  await scenario("4a", "Quote above a buyer's max -> canceled_over_max", () => {
    const A = mkOrder("A", 5, { maxPricePerSeatCents: 2000 });
    const B = mkOrder("B", 5, { maxPricePerSeatCents: 2800 }); // exactly equal to the price: allowed
    const C = mkOrder("C", 5, { maxPricePerSeatCents: 2799 }); // one cent short
    const D = mkOrder("D", 5); // no max
    const E = mkOrder("E", 5, { maxPricePerSeatCents: 3500 }); // max above list
    const r = settle([A, B, C, D, E], [mkQuote("certly", [[1, 2800]])]);
    eq("one settlement per member (each order counted once)", r.out.length, 5);
    expectSettlement("max 2000 < quote 2800 -> canceled_over_max", r.get("A"), "canceled_over_max", null);
    expectSettlement("max 2800 == quote 2800 -> deal_applied", r.get("B"), "deal_applied", 2800, "certly");
    expectSettlement("max 2799 < quote 2800 -> canceled_over_max", r.get("C"), "canceled_over_max", null);
    expectSettlement("no max -> deal_applied @2800", r.get("D"), "deal_applied", 2800, "certly");
    expectSettlement("max 3500 (> list) -> deal_applied @2800", r.get("E"), "deal_applied", 2800, "certly");

    // per-account fee counts toward the cap: 2500 + 500/5 = 2600
    const F = mkOrder("F", 5, { maxPricePerSeatCents: 2599 });
    const G = mkOrder("G", 5, { maxPricePerSeatCents: 2600 });
    const r2 = settle([F, G], [mkQuote("certly", [[1, 2500]], { fee: 500 })]);
    expectSettlement("tier 2500 + fee 500/5 seats = 2600 > max 2599 -> canceled_over_max", r2.get("F"), "canceled_over_max", null);
    expectSettlement("effective 2600 == max 2600 -> deal_applied", r2.get("G"), "deal_applied", 2600, "certly");
  });

  await scenario("5a", "No quote beats list -> list_price (nobody pays more than list); max < list -> canceled_over_max", () => {
    const mk = () => [
      mkOrder("N", 5), // no max
      mkOrder("M", 5, { maxPricePerSeatCents: 2800 }), // max < list
      mkOrder("H", 5, { maxPricePerSeatCents: 3500 }), // max >= list
      mkOrder("PV", 5, { preferredVendorId: "vantly" }), // list = 3200
      mkOrder("PC", 5, { preferredVendorId: "certly" }), // list = 3000
    ];
    const verify = (label: string, quotes: Quote[]) => {
      const r = settle(mk(), quotes);
      expectSettlement(`${label}: no-max buyer -> list_price @${LIST_ANY}`, r.get("N"), "list_price", LIST_ANY, null);
      expectSettlement(`${label}: max 2800 < list -> canceled_over_max`, r.get("M"), "canceled_over_max", null);
      expectSettlement(`${label}: max 3500 >= list -> list_price @${LIST_ANY}`, r.get("H"), "list_price", LIST_ANY, null);
      expectSettlement(`${label}: vantly-preferred -> list_price @${LIST_VANTLY}`, r.get("PV"), "list_price", LIST_VANTLY, null);
      expectSettlement(`${label}: certly-preferred -> list_price @${LIST_CERTLY}`, r.get("PC"), "list_price", LIST_CERTLY, null);
      check(`${label}: nobody priced above their list`, r.out.every((s) => s.pricePerSeatCents == null || s.pricePerSeatCents <= LIST_VANTLY));
    };
    verify("no quotes at all", []);
    verify("quote == list (3000)", [mkQuote("certly", [[1, 3000]])]);
    verify("quote above list (3400)", [mkQuote("certly", [[1, 3400]])]);
    verify("tier unreachable (minSeats 100, pool 25)", [mkQuote("certly", [[100, 2000]])]);
    verify("fee pushes effective >= list (2900 + 1000/5 = 3100)", [mkQuote("certly", [[1, 2900]], { fee: 1000 })]);
    verify("tiers list empty", [mkQuote("certly", [])]);
  });

  await scenario("5b", "Deal below list and below max -> deal_applied at tier + perAccountFee/seats", () => {
    const tiers: Array<[number, number]> = [
      [1, 2900],
      [10, 2700],
      [25, 2500],
    ];
    const q = mkQuote("certly", tiers, { fee: 500 });
    // pool = 12 + 8 + 5 = 25 seats -> third tier (2500)
    const a = mkOrder("A", 12);
    const b = mkOrder("B", 8, { maxPricePerSeatCents: 2800 });
    const c = mkOrder("C", 5, { maxPricePerSeatCents: 2600 });
    const r = settle([a, b, c], [q]);
    const exact = (price: number, fee: number, seats: number) => price + fee / seats;
    for (const [o, tier] of [[a, 2500], [b, 2500], [c, 2500]] as const) {
      const s = r.get(o.id);
      const ex = exact(tier, 500, o.seats);
      const ok = s?.status === "deal_applied" && Number.isInteger(s.pricePerSeatCents) && Math.abs((s.pricePerSeatCents ?? 0) - ex) <= 0.5 && s.vendorId === "certly";
      check(`${o.id} (${o.seats} seats): deal_applied @ ~${ex.toFixed(2)} (tier 2500 + 500/${o.seats}), integer cents`, ok, `got ${s?.status} @ ${s?.pricePerSeatCents}`);
    }
    expectSettlement("12 seats: 2500 + 500/12 = 2541.67 -> 2542", r.get("A"), "deal_applied", 2542, "certly");
    expectSettlement("8 seats: 2500 + 500/8 = 2562.5 -> 2563", r.get("B"), "deal_applied", 2563, "certly");
    expectSettlement("5 seats: 2500 + 500/5 = 2600 (== max) -> 2600", r.get("C"), "deal_applied", 2600, "certly");
    check("every deal is below list", r.out.every((s) => s.pricePerSeatCents != null && s.pricePerSeatCents < LIST_ANY));

    // pool one seat short of the 25-seat tier -> falls back to the 10-seat tier (2700)
    const a2 = mkOrder("A2", 12);
    const b2 = mkOrder("B2", 8);
    const c2 = mkOrder("C2", 4);
    const r2 = settle([a2, b2, c2], [q]);
    expectSettlement("pool 24 seats (tier 25 not reached): 12 seats -> 2700 + 500/12 = 2742", r2.get("A2"), "deal_applied", 2742, "certly");
    expectSettlement("pool 24 seats: 4 seats -> 2700 + 500/4 = 2825", r2.get("C2"), "deal_applied", 2825, "certly");

    // best quote wins across vendors
    const r3 = settle([mkOrder("X", 10)], [mkQuote("certly", [[1, 2800]]), mkQuote("vantly", [[1, 2600]], { fee: 100 })]);
    expectSettlement("two quotes: vantly 2600 + 100/10 = 2610 beats certly 2800", r3.get("X"), "deal_applied", 2610, "vantly");
  });

  await scenario("5c", "preferredVendorId restricts which quotes apply", () => {
    const P = mkOrder("P", 5, { preferredVendorId: "certly" });
    const Q = mkOrder("Q", 5, { preferredVendorId: "vantly" });
    const R = mkOrder("R", 5);
    const certly = mkQuote("certly", [[1, 2800]]);
    const vantly = mkQuote("vantly", [[1, 2000]]);
    const r = settle([P, Q, R], [certly, vantly]);
    expectSettlement("certly-preferred ignores cheaper vantly quote -> 2800 via certly", r.get("P"), "deal_applied", 2800, "certly");
    expectSettlement("vantly-preferred -> 2000 via vantly", r.get("Q"), "deal_applied", 2000, "vantly");
    expectSettlement("no preference -> best of all (2000 via vantly)", r.get("R"), "deal_applied", 2000, "vantly");

    const r2 = settle([P, Q, R], [certly]);
    expectSettlement("only a certly quote: vantly-preferred buyer gets list_price @3200 (not certly's 2800)", r2.get("Q"), "list_price", LIST_VANTLY, null);
    expectSettlement("only a certly quote: certly-preferred buyer -> 2800", r2.get("P"), "deal_applied", 2800, "certly");

    const Qm = mkOrder("Qm", 5, { preferredVendorId: "vantly", maxPricePerSeatCents: 3100 });
    expectSettlement("vantly-preferred with max 3100 < vantly list 3200 and no vantly quote -> canceled_over_max", settle([Qm], [certly]).get("Qm"), "canceled_over_max", null);

    // preferred-vendor orders only count toward that vendor's pool size
    // vantly tier needs 20 seats; R(15, no pref) + P(10, certly-pref) -> vantly pool = 15 (P doesn't count)
    const P10 = mkOrder("P10", 10, { preferredVendorId: "certly" });
    const R15 = mkOrder("R15", 15);
    const tiered = mkQuote("vantly", [[20, 2000]]);
    expectSettlement("certly-preferred seats don't count toward vantly tier (15 < 20) -> list_price", settle([P10, R15], [tiered]).get("R15"), "list_price", LIST_ANY, null);
    const V5 = mkOrder("V5", 5, { preferredVendorId: "vantly" });
    expectSettlement("vantly-preferred seats do count (15 + 5 = 20) -> deal_applied @2000", settle([P10, R15, V5], [tiered]).get("R15"), "deal_applied", 2000, "vantly");
  });

  await scenario("5d", "separateAccountsConfirmed=false quote is ignored", () => {
    const R = mkOrder("R", 5);
    const cheapNoSep = mkQuote("vantly", [[1, 2000]], { sep: false });
    const ok = mkQuote("certly", [[1, 2800]], { sep: true });
    expectSettlement("cheaper quote with separateAccountsConfirmed=false skipped -> 2800 via certly", settle([R], [cheapNoSep, ok]).get("R"), "deal_applied", 2800, "certly");
    expectSettlement("only an unconfirmed-accounts quote -> list_price", settle([R], [cheapNoSep]).get("R"), "list_price", LIST_ANY, null);
    const Pv = mkOrder("Pv", 5, { preferredVendorId: "vantly", maxPricePerSeatCents: 3100 });
    expectSettlement("only unconfirmed quote + max < list -> canceled_over_max", settle([Pv], [cheapNoSep]).get("Pv"), "canceled_over_max", null);
    const unknown = settle([R], [mkQuote("vantly", [[1, 2000]], { sep: null })]).get("R");
    note(`separateAccountsConfirmed=null (unstated) quote is currently ${unknown?.status === "deal_applied" ? "ACCEPTED" : "ignored"} (SPEC §4 says "quotes that confirm separate accounts"; code only skips === false)`);
  });

  // ---- 5 end-to-end via the API (no quotes available) ----------------------------------------
  await scenario("5e", "API settle with no quotes: list_price / canceled_over_max, never above list, never charged", async () => {
    const v0 = await reset();
    const s = await api<PoolView>("POST", "/api/pool/settle");
    check("settle -> 200", s.status === 200, `${s.status} ${s.text.slice(0, 200)}`);
    const v = s.json;
    eq("pool.status after settle", v.pool.status, "settled");
    const members = v.orders.filter((o) => v0.pool.memberOrderIds.includes(o.id));
    check("had members to settle", members.length > 0);
    const bad: string[] = [];
    for (const o of members) {
      const list = listFor(v.vendors, o);
      const wantStatus = o.maxPricePerSeatCents == null || o.maxPricePerSeatCents >= list ? "list_price" : "canceled_over_max";
      const wantPrice = wantStatus === "list_price" ? list : null;
      if (o.status !== wantStatus || o.finalPricePerSeatCents !== wantPrice) bad.push(`${o.buyerName}: ${o.status}@${o.finalPricePerSeatCents} (wanted ${wantStatus}@${wantPrice})`);
    }
    check("every member is list_price@list or canceled_over_max (per max vs list)", bad.length === 0, bad.join("; "));
    check("no order has status 'charged' or 'deal_applied'", v.orders.every((o) => o.status !== "charged" && o.status !== "deal_applied"));
    check("nobody's final price exceeds their list price", v.orders.every((o) => o.finalPricePerSeatCents == null || o.finalPricePerSeatCents <= listFor(v.vendors, o)));
    check("canceled_over_max orders carry no final price/link", v.orders.filter((o) => o.status === "canceled_over_max").every((o) => o.finalPricePerSeatCents === null && o.redemptionLink === null));
    check("no redemption links without a deal", v.orders.every((o) => o.redemptionLink === null));
    const excluded = v.orders.filter((o) => !v0.pool.memberOrderIds.includes(o.id));
    check("excluded orders are not settled/charged", excluded.every((o) => !["deal_applied", "list_price", "charged", "canceled_over_max"].includes(o.status)), excluded.map((o) => `${o.buyerName}:${o.status}`).join(", "));
    const s2 = await api<PoolView>("POST", "/api/pool/settle");
    eq("second settle is a no-op (same order statuses)", s2.json?.orders.map((o) => o.status), v.orders.map((o) => o.status));
  });

  // ---- 4/5 end-to-end with a fixture quote inserted into SQLite --------------------------------
  await scenario("4e", "API settle with a fixture Certly quote (needs DB_PATH): deals, over-max cancels, links", async () => {
    if (!DB_PATH) return skip("e2e settle with fixture quote", "set DB_PATH to the dev server's SQLite file to enable");
    let Database: typeof import("better-sqlite3");
    try {
      Database = (await import("better-sqlite3")).default;
    } catch (e) {
      return skip("e2e settle with fixture quote", `better-sqlite3 unavailable: ${e instanceof Error ? e.message : e}`);
    }
    const v0 = await reset();
    const db = new Database(DB_PATH);
    try {
      const callId = "call_acc_fixture";
      db.prepare("INSERT INTO calls (id, json) VALUES (?, ?)").run(
        callId,
        JSON.stringify({
          id: callId, poolId: v0.pool.id, vendorId: "certly", sequence: 1, dialCallId: "acc-fixture", status: "extracted", source: "recorded_replay",
          recordedAt: T0, instruction: "acceptance fixture (not a real call)", transcriptTurns: [], error: null, startedAt: T0, endedAt: T0,
        }),
      );
      const quote = mkQuote("certly", [[1, 2800], [50, 2400]]);
      db.prepare("INSERT INTO quotes (id, json) VALUES (?, ?)").run("quote_acc_fixture", JSON.stringify({ ...quote, id: "quote_acc_fixture", callId }));
    } finally {
      db.close();
    }
    const pre = await view();
    check("fixture quote visible in GET /api/pool", pre.quotes.length === 1 && pre.calls.length === 1, `quotes=${pre.quotes.length} calls=${pre.calls.length}`);
    const members = pre.orders.filter((o) => pre.pool.memberOrderIds.includes(o.id));
    const seatsTotal = members.reduce((n, o) => n + o.seats, 0);
    check("pool >= 50 seats so the 2400 tier applies", seatsTotal >= 50, `seats=${seatsTotal}`);
    const price = 2400;

    const s = await api<PoolView>("POST", "/api/pool/settle");
    check("settle -> 200", s.status === 200, `${s.status} ${s.text.slice(0, 200)}`);
    const v = s.json;
    eq("pool.status after settle", v.pool.status, "settled");
    const bad: string[] = [];
    let deals = 0;
    let overs = 0;
    for (const m of members) {
      const o = v.orders.find((x) => x.id === m.id)!;
      const list = listFor(v.vendors, m);
      const cap = Math.min(list, m.maxPricePerSeatCents ?? list);
      const want: Order["status"] = price <= cap && price < list ? "deal_applied" : m.maxPricePerSeatCents == null || m.maxPricePerSeatCents >= list ? "list_price" : "canceled_over_max";
      if (want === "deal_applied") deals++;
      if (want === "canceled_over_max") overs++;
      const okPrice = want === "deal_applied" ? o.finalPricePerSeatCents === price : want === "list_price" ? o.finalPricePerSeatCents === list : o.finalPricePerSeatCents === null;
      const okLink = want === "deal_applied" ? !!o.redemptionLink && o.redemptionLink.includes(o.id) : o.redemptionLink === null;
      if (o.status !== want || !okPrice || !okLink) bad.push(`${o.buyerName}: got ${o.status}@${o.finalPricePerSeatCents} link=${o.redemptionLink}; wanted ${want}`);
    }
    check("every member settled per SPEC §4 (cap = min(list, max))", bad.length === 0, bad.join("; "));
    check("fixture exercises both deal_applied and canceled_over_max", deals > 0 && overs > 0, `deals=${deals} overs=${overs}`);
    check("no order charged; no price above list", v.orders.every((o) => o.status !== "charged" && (o.finalPricePerSeatCents == null || o.finalPricePerSeatCents <= listFor(v.vendors, o))));
    const nonMembers = v.orders.filter((o) => !pre.pool.memberOrderIds.includes(o.id));
    check("excluded orders untouched", nonMembers.every((o) => !["deal_applied", "list_price", "canceled_over_max", "charged"].includes(o.status)));
    const dealOrder = v.orders.find((o) => o.status === "deal_applied");
    if (dealOrder) {
      eq("cancel of deal_applied order -> 409", (await api("POST", `/api/orders/${dealOrder.id}/cancel`)).status, 409);
      const g = (await api<OrderView>("GET", `/api/orders/${dealOrder.id}`)).json;
      eq("GET /api/orders/:id reports the same status", g?.order?.status, "deal_applied");
    }
  });

  // ---- 6. negotiate error handling ------------------------------------------------------------
  await scenario("6", "POST /api/pool/negotiate: replay with no recordings; live without keys", async () => {
    await reset();
    const bad = await api<ApiError>("POST", "/api/pool/negotiate", { mode: "bogus" });
    check("invalid mode -> 400 with message", bad.status === 400 && typeof bad.json?.error === "string", `${bad.status} ${bad.text.slice(0, 200)}`);

    if (recordedCallsFor("certly") === 0) {
      const r = await api<ApiError>("POST", "/api/pool/negotiate", { mode: "replay" });
      check("replay with no recordings -> 4xx", r.status >= 400 && r.status < 500, `${r.status} ${r.text.slice(0, 200)}`);
      check("replay error message is clear (mentions recorded call)", typeof r.json?.error === "string" && /record/i.test(r.json.error), r.text.slice(0, 200));
      const v = await view();
      eq("failed replay has no side effects: pool still 'open'", v.pool.status, "open");
      eq("failed replay has no side effects: no call rows", v.calls.length, 0);
    } else {
      const r = await api<Call>("POST", "/api/pool/negotiate", { mode: "replay" });
      check("replay with a recording -> 201", r.status === 201, `${r.status} ${r.text.slice(0, 200)}`);
      eq("replay call source", r.json?.source, "recorded_replay");
      check("replay call carries its recordedAt timestamp", typeof r.json?.recordedAt === "string" && !Number.isNaN(Date.parse(r.json.recordedAt)), r.text.slice(0, 200));
      note("data/recorded-calls.json has certly recordings: 'no recordings' case not exercised");
    }

    await reset();
    if (dialKeysLookConfigured()) {
      skip("live mode without keys -> 400", "Dial keys appear to be configured (env/.env.local); not placing a real call");
    } else {
      const r = await api<ApiError>("POST", "/api/pool/negotiate", { mode: "live" });
      if (r.status === 400 && /not configured/i.test(r.json?.error ?? "")) {
        check("live without keys -> 400 'not configured' naming the missing vars", /DIAL_API_KEY/.test(r.json.error), r.text.slice(0, 300));
        const v = await view();
        eq("rejected live call has no side effects: pool still 'open'", v.pool.status, "open");
        eq("rejected live call has no side effects: no call rows", v.calls.length, 0);
      } else if (r.status === 400 && /E\.164/.test(r.json?.error ?? "")) {
        skip("live mode without keys -> 400", "server has Dial keys configured (phone validation reached)");
      } else if (r.status === 201 || r.status === 502) {
        skip("live mode without keys -> 400", `server has Dial keys configured (got ${r.status}); a live call may have been attempted`);
      } else {
        check("live without keys -> 400 'not configured'", false, `${r.status} ${r.text.slice(0, 300)}`);
      }
    }
  });

  // ---- 7. Keewano evidence --------------------------------------------------------------------
  await scenario("7", "GET /api/pool evidence.source is keewano_live | keewano_cached | unavailable", async () => {
    await reset();
    const r = await api<PoolView>("GET", "/api/pool");
    eq("GET /api/pool -> 200", r.status, 200);
    const ev = r.json?.evidence;
    check("evidence present", !!ev, r.text.slice(0, 200));
    check(`evidence.source in {${SOURCES.join(", ")}}`, SOURCES.includes(ev?.source), `got ${j(ev?.source)}`);
    check("evidence.summary is a non-empty string", typeof ev?.summary === "string" && ev.summary.length > 0);
    if (ev?.source === "unavailable") {
      check("unavailable evidence carries no numbers (nothing fabricated)", ev.interestedBuyers90d === null && ev.abandonedOverPrice90d === null && ev.medianMaxPricePerSeatCents === null, j(ev));
    } else {
      check("evidence declares whether history is synthetic", typeof ev?.isSyntheticHistory === "boolean");
    }
    check("pool view also carries the rest of the payload (pool, orders, vendors, timeSaved, now)", !!(r.json?.pool && Array.isArray(r.json?.orders) && Array.isArray(r.json?.vendors) && r.json?.timeSaved && r.json?.now));
  });

  // leave the target DB in a clean seeded state
  try {
    await reset();
  } catch {
    /* ignore */
  }

  console.log(`\n${nFail === 0 ? "ALL OK" : "FAILURES"}: ${nPass} passed, ${nFail} failed, ${nSkip} skipped`);
  process.exit(nFail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
