import 'server-only';
import { createClient, type Client, type InValue } from '@libsql/client';

/**
 * ฐานข้อมูล = Turso (libSQL) ตัวเดียว ไม่ใช้ Docker/Postgres แล้ว
 *
 * ตารางของ GreenPort ใช้ prefix gp_ เพื่อไม่ชนกับตาราง trades/stocks
 * ที่ sync มาจาก Google Sheet ของผู้ใช้ซึ่งอยู่ใน DB เดียวกัน
 */

function readEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function dbUrl() {
  return readEnv('tursourl', 'TURSO_DATABASE_URL', 'TURSO_URL');
}
export function dbToken() {
  return readEnv('tursoToken', 'TURSO_AUTH_TOKEN', 'TURSO_TOKEN');
}

declare global {
  // eslint-disable-next-line no-var
  var __greenport_client: Client | undefined;
  // eslint-disable-next-line no-var
  var __greenport_schema_ready: Promise<void> | undefined;
}

export function db(): Client {
  if (global.__greenport_client) return global.__greenport_client;
  const url = dbUrl();
  const authToken = dbToken();
  if (!url) {
    throw new Error(
      'ยังไม่ได้ตั้งค่าฐานข้อมูล — ใส่ tursourl และ tursoToken ใน .env.local'
    );
  }
  const client = createClient(
    url.startsWith('file:') ? { url } : { url, authToken }
  );
  global.__greenport_client = client;
  return client;
}

/**
 * แปลง placeholder แบบ Postgres ($1, $2) เป็นแบบ SQLite (?)
 * และเรียงค่า argument ใหม่ตามลำดับที่ปรากฏจริง
 * (รองรับกรณีที่ query ใช้ $2 ซ้ำหลายที่ เช่น COALESCE($2, name))
 */
function toSqlite(text: string, params: unknown[]): { sql: string; args: InValue[] } {
  const args: InValue[] = [];
  const sql = text.replace(/\$(\d+)/g, (_m, d: string) => {
    args.push(params[Number(d) - 1] as InValue);
    return '?';
  });
  return { sql, args: args.length ? args : (params as InValue[]) };
}

/** แปลงค่าที่ SQLite คืนมาให้ใช้งานได้เหมือนฝั่ง Postgres */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') out[k] = Number(v);
    // คอลัมน์ boolean เก็บเป็น 0/1 ใน SQLite
    else if ((k === 'is_active' || k === 'is_archived') && typeof v === 'number')
      out[k] = v !== 0;
    else out[k] = v;
  }
  return out;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gp_portfolios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'main' CHECK (kind IN ('main','plan')),
  description   TEXT,
  currency      TEXT NOT NULL DEFAULT 'USD',
  initial_cash  REAL NOT NULL DEFAULT 0,
  color         TEXT NOT NULL DEFAULT '#66BB6A',
  is_archived   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gp_stocks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol        TEXT NOT NULL UNIQUE,
  name          TEXT,
  exchange      TEXT,
  currency      TEXT,
  sector        TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gp_trades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id  INTEGER NOT NULL REFERENCES gp_portfolios(id) ON DELETE CASCADE,
  stock_id      INTEGER NOT NULL REFERENCES gp_stocks(id) ON DELETE CASCADE,
  side          TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity      REAL NOT NULL CHECK (quantity > 0),
  price         REAL NOT NULL CHECK (price >= 0),
  fee           REAL NOT NULL DEFAULT 0,
  traded_at     TEXT NOT NULL DEFAULT (date('now')),
  note          TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gp_trades_portfolio ON gp_trades(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_gp_trades_stock ON gp_trades(stock_id);
CREATE INDEX IF NOT EXISTS idx_gp_trades_date ON gp_trades(traded_at);
CREATE TABLE IF NOT EXISTS gp_targets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id   INTEGER NOT NULL REFERENCES gp_portfolios(id) ON DELETE CASCADE,
  stock_id       INTEGER NOT NULL REFERENCES gp_stocks(id) ON DELETE CASCADE,
  target_percent REAL NOT NULL DEFAULT 0 CHECK (target_percent >= 0),
  note           TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (portfolio_id, stock_id)
);
CREATE TABLE IF NOT EXISTS gp_levels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id   INTEGER NOT NULL REFERENCES gp_stocks(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('support','resistance')),
  price      REAL NOT NULL CHECK (price > 0),
  label      TEXT,
  priority   INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  is_active  INTEGER NOT NULL DEFAULT 1,
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gp_levels_stock ON gp_levels(stock_id);
CREATE TABLE IF NOT EXISTS gp_target_groups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES gp_portfolios(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  target_pct   REAL NOT NULL DEFAULT 0 CHECK (target_pct >= 0),
  color        TEXT NOT NULL DEFAULT '#66BB6A',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_other     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (portfolio_id, key)
);
CREATE TABLE IF NOT EXISTS gp_group_symbols (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES gp_target_groups(id) ON DELETE CASCADE,
  symbol   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gp_group_symbols_group ON gp_group_symbols(group_id);
CREATE INDEX IF NOT EXISTS idx_gp_group_symbols_symbol ON gp_group_symbols(symbol);
CREATE TABLE IF NOT EXISTS gp_price_cache (
  symbol         TEXT PRIMARY KEY,
  price          REAL,
  previous_close REAL,
  day_high       REAL,
  day_low        REAL,
  currency       TEXT,
  short_name     TEXT,
  exchange       TEXT,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** ตารางที่ต้องมีครบ ถ้าครบแล้วข้ามการรัน DDL ทั้งชุดไปเลย */
const REQUIRED_TABLES = [
  'gp_portfolios',
  'gp_stocks',
  'gp_trades',
  'gp_targets',
  'gp_levels',
  'gp_price_cache',
  'gp_target_groups',
  'gp_group_symbols',
];

function ensureSchema(): Promise<void> {
  if (!global.__greenport_schema_ready) {
    global.__greenport_schema_ready = (async () => {
      // เช็คด้วย query เดียวก่อนว่าตารางครบไหม — ถ้าครบก็ไม่ต้องยิง DDL 15 คำสั่ง
      // (ปกติจะครบเสมอหลังรันครั้งแรก การยิง batch ทุก cold start เปลืองรอบเดินทางไป Turso)
      const existing = await db().execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'gp_%'`
      );
      const have = new Set(existing.rows.map((r) => String(r.name)));
      if (REQUIRED_TABLES.every((t) => have.has(t))) return;

      const stmts = SCHEMA.split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      await db().batch(stmts, 'write');
    })().catch((err) => {
      global.__greenport_schema_ready = undefined;
      throw err;
    });
  }
  return global.__greenport_schema_ready;
}

export async function query<T = any>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const { sql, args } = toSqlite(text, params);
  const rs = await db().execute({ sql, args });
  return rs.rows.map((r) => normalizeRow(r as Record<string, unknown>)) as T[];
}

export async function one<T = any>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * libSQL ไม่มี interactive transaction แบบ pg pool client
 * ใช้ transaction() ของ client แทน แล้วส่ง q ที่หน้าตาเหมือนเดิมให้ callback
 */
export async function tx<T>(fn: (q: typeof query) => Promise<T>): Promise<T> {
  await ensureSchema();
  const trx = await db().transaction('write');
  try {
    const scoped = (async <R>(text: string, params: unknown[] = []) => {
      const { sql, args } = toSqlite(text, params);
      const rs = await trx.execute({ sql, args });
      return rs.rows.map((r) => normalizeRow(r as Record<string, unknown>)) as R[];
    }) as typeof query;
    const out = await fn(scoped);
    await trx.commit();
    return out;
  } catch (err) {
    await trx.rollback().catch(() => undefined);
    throw err;
  }
}
