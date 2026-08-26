import 'server-only';
import { createClient, type Client } from '@libsql/client';

/**
 * ต่อกับ Turso (libSQL) ที่เก็บข้อมูลซื้อขายตัวจริง ซึ่ง sync มาจาก Google Sheet อีกที
 * GreenPort อ่านอย่างเดียว ไม่เขียนกลับ เพื่อไม่ให้ชนกับ sync ฝั่งชีต
 */

function readEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function tursoConfigured(): boolean {
  return Boolean(
    readEnv('tursourl', 'TURSO_DATABASE_URL', 'TURSO_URL') &&
      readEnv('tursoToken', 'TURSO_AUTH_TOKEN', 'TURSO_TOKEN')
  );
}

let client: Client | undefined;

export function turso(): Client {
  if (client) return client;
  const url = readEnv('tursourl', 'TURSO_DATABASE_URL', 'TURSO_URL');
  const authToken = readEnv('tursoToken', 'TURSO_AUTH_TOKEN', 'TURSO_TOKEN');
  if (!url || !authToken) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า Turso — ต้องมี tursourl และ tursoToken ใน .env.local'
    );
  }
  client = createClient({ url, authToken });
  return client;
}

/** 1 แถวในตาราง trades ของ Turso */
export interface TursoTrade {
  id: number;
  ticker: string;
  action: string;
  buy_date: string;
  quantity: number;
  price: number;
  cut_loss: number;
  target: number;
  sold_date: string | null;
  sold_qty: number | null;
  sold_price: number | null;
  status: string;
  group_key: string | null;
  target_alloc: number | null;
  portfolio_type: string | null;
}

export interface TursoStock {
  symbol: string;
  category: string | null;
  detail: string | null;
}

export async function fetchTursoTrades(): Promise<TursoTrade[]> {
  const rs = await turso().execute(
    `SELECT id, ticker, action, buy_date, quantity, price, cut_loss, target,
            sold_date, sold_qty, sold_price, status, group_key, target_alloc, portfolio_type
       FROM trades
      ORDER BY buy_date ASC, id ASC`
  );
  return rs.rows as unknown as TursoTrade[];
}

export async function fetchTursoStocks(): Promise<TursoStock[]> {
  const rs = await turso().execute(`SELECT symbol, category, detail FROM stocks`);
  return rs.rows as unknown as TursoStock[];
}

/** เวลาที่ sync ล่าสุดจากชีต (ไว้โชว์ให้รู้ว่าข้อมูลสดแค่ไหน) */
export async function fetchTursoLastSync(): Promise<{ source: string; rows: number; synced_at: string }[]> {
  try {
    const rs = await turso().execute(
      `SELECT source, rows, synced_at FROM sync_log ORDER BY synced_at DESC LIMIT 5`
    );
    return rs.rows as unknown as { source: string; rows: number; synced_at: string }[];
  } catch {
    return [];
  }
}
