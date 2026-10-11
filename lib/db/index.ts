// SQLite store. Each entity is a JSON document keyed by id — simple and enough for the demo.
// Source of truth for current order/pool/call/quote state (Keewano gets an analytical copy only).
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { Order, Pool, Call, Quote } from "@/lib/contracts";

// On Vercel the deployment filesystem is read-only except /tmp (per-instance, resets on cold start).
const DB_PATH =
  process.env.DB_PATH ?? (process.env.VERCEL ? "/tmp/want-it.db" : path.join(process.cwd(), "data", "want-it.db"));

type Tables = { orders: Order; pools: Pool; calls: Call; quotes: Quote };
export type TableName = keyof Tables;

const g = globalThis as unknown as { __wantItDb?: Database.Database };

export function db(): Database.Database {
  if (!g.__wantItDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const d = new Database(DB_PATH);
    d.pragma("journal_mode = WAL");
    for (const t of ["orders", "pools", "calls", "quotes"]) {
      d.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    }
    d.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    d.exec(`CREATE UNIQUE INDEX IF NOT EXISTS orders_idem ON orders (json_extract(json, '$.idempotencyKey'))`);
    g.__wantItDb = d;
  }
  return g.__wantItDb;
}

export function put<T extends TableName>(table: T, row: Tables[T]): Tables[T] {
  db().prepare(`INSERT INTO ${table} (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`).run(row.id, JSON.stringify(row));
  return row;
}

export function get<T extends TableName>(table: T, id: string): Tables[T] | null {
  const r = db().prepare(`SELECT json FROM ${table} WHERE id = ?`).get(id) as { json: string } | undefined;
  return r ? readRow(table, r.json) : null;
}

export function all<T extends TableName>(table: T): Tables[T][] {
  return (db().prepare(`SELECT json FROM ${table} ORDER BY created_at, id`).all() as { json: string }[]).map((r) => readRow(table, r.json));
}

export function findOrderByIdempotencyKey(key: string): Order | null {
  const r = db().prepare(`SELECT json FROM orders WHERE json_extract(json, '$.idempotencyKey') = ?`).get(key) as { json: string } | undefined;
  return r ? JSON.parse(r.json) : null;
}

export function kvGet(key: string): string | null {
  const r = db().prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function kvSet(key: string, value: string) {
  db().prepare(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function resetAll() {
  for (const t of ["orders", "pools", "calls", "quotes", "kv"]) db().exec(`DELETE FROM ${t}`);
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

// Old persisted calls gain additive fields without a destructive database migration.
function readRow<T extends TableName>(table: T, json: string): Tables[T] {
  const row = JSON.parse(json);
  return (table === "calls" ? Call.parse(row) : row) as Tables[T];
}
