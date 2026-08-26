import 'server-only';
import { query, tx } from './db';
import { fetchTursoStocks, fetchTursoTrades, type TursoStock, type TursoTrade } from './turso';

/** ticker ที่ไม่ใช่หุ้นจริง ข้ามไป */
const SKIP_TICKERS = new Set(['CASH']);

export interface SyncResult {
  portfolioId: number;
  portfolioName: string;
  stocks: number;
  buys: number;
  sells: number;
  levels: number;
  targets: number;
  skipped: number;
  latestTradeDate: string | null;
  targetTotal: number;
  warnings: string[];
}

const norm = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** วันที่จาก Turso เป็น YYYY-MM-DD อยู่แล้ว แค่กันค่าแปลก ๆ */
function cleanDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * ดึงข้อมูลจาก Turso มาลง Postgres แบบ idempotent
 *
 * - รายการซื้อขายทั้งหมดถูกแทนที่ใหม่ทุกครั้ง (Turso คือ source of truth)
 * - แนวรับ/แนวต้านที่มาจาก cut_loss/target ก็ถูกแทนที่เช่นกัน
 *   แต่แนวที่ผู้ใช้เพิ่มเองในเว็บ (source = 'manual') จะไม่ถูกแตะ
 * - สัดส่วนเป้าหมายที่ตั้งเองในเว็บจะไม่ถูกลบ ถ้า Turso ไม่มีค่ามาให้
 */
export async function syncFromTurso(
  portfolioName = 'พอร์ตหลัก'
): Promise<SyncResult> {
  const warnings: string[] = [];
  const [trades, stocks] = await Promise.all([fetchTursoTrades(), fetchTursoStocks()]);

  const stockMeta = new Map<string, TursoStock>();
  for (const s of stocks) stockMeta.set(s.symbol.toUpperCase(), s);

  // ---- พอร์ต ----
  const existing = await query<{ id: number }>(
    `SELECT id FROM gp_portfolios WHERE name = $1`,
    [portfolioName]
  );
  const portfolioId = existing.length
    ? existing[0].id
    : (
        await query<{ id: number }>(
          `INSERT INTO gp_portfolios (name, kind, description, currency, initial_cash, color)
           VALUES ($1,'main',$2,'USD',0,'#1B5E20') RETURNING id`,
          [portfolioName, 'ข้อมูลจริงจาก Turso (sync จาก Google Sheet)']
        )
      )[0].id;

  // ---- หุ้นที่เกี่ยวข้อง ----
  const usable = trades.filter((t) => {
    const tk = t.ticker?.toUpperCase();
    return tk && !SKIP_TICKERS.has(tk) && norm(t.quantity) > 0 && cleanDate(t.buy_date);
  });
  const skipped = trades.length - usable.length;

  const symbols = [...new Set(usable.map((t) => t.ticker.toUpperCase()))];
  const stockIds = new Map<string, number>();

  for (const sym of symbols) {
    const meta = stockMeta.get(sym);
    // group_key ของไม้ล่าสุดใช้เป็น sector, category (แอดอั้ม/จารย์ Shay) เก็บเป็นโน้ต
    const lastGroup =
      [...usable].reverse().find((t) => t.ticker.toUpperCase() === sym)?.group_key ?? null;
    const rows = await query<{ id: number }>(
      `INSERT INTO gp_stocks (symbol, name, currency, sector, note)
       VALUES ($1,$2,'USD',$3,$4)
       ON CONFLICT (symbol) DO UPDATE SET
         name   = COALESCE(EXCLUDED.name, gp_stocks.name),
         sector = COALESCE(EXCLUDED.sector, gp_stocks.sector),
         note   = COALESCE(EXCLUDED.note, gp_stocks.note)
       RETURNING id`,
      [sym, meta?.detail ?? null, lastGroup, meta?.category ?? null]
    );
    stockIds.set(sym, rows[0].id);
    if (!meta) warnings.push(`${sym} ไม่มีใน stock master ของ Turso — ไม่มีชื่อบริษัท`);
  }

  // ---- เขียนรายการซื้อขาย + แนว ----
  let buys = 0;
  let sells = 0;
  let levels = 0;

  await tx(async (q) => {
    await q(`DELETE FROM gp_trades WHERE portfolio_id = $1 AND source = 'turso'`, [portfolioId]);
    // ลบเฉพาะแนวที่เคย sync มาจาก Turso ไม่ยุ่งกับที่ผู้ใช้เพิ่มเอง
    await q(`DELETE FROM gp_levels WHERE source = 'turso'`);

    const levelSeen = new Set<string>();

    for (const t of usable) {
      const sym = t.ticker.toUpperCase();
      const stockId = stockIds.get(sym)!;
      const buyDate = cleanDate(t.buy_date)!;

      await q(
        `INSERT INTO gp_trades (portfolio_id, stock_id, side, quantity, price, fee, traded_at, note, source)
         VALUES ($1,$2,'buy',$3,$4,0,$5,$6,'turso')`,
        [
          portfolioId,
          stockId,
          norm(t.quantity),
          norm(t.price),
          buyDate,
          t.group_key ? `group: ${t.group_key}` : null,
        ]
      );
      buys++;

      const soldDate = cleanDate(t.sold_date);
      const soldQty = norm(t.sold_qty);
      const soldPrice = norm(t.sold_price);
      if (soldDate && soldQty > 0 && soldPrice > 0) {
        if (soldQty > norm(t.quantity) + 1e-9) {
          warnings.push(`${sym} ${buyDate}: ขาย ${soldQty} มากกว่าที่ซื้อ ${t.quantity}`);
        }
        await q(
          `INSERT INTO gp_trades (portfolio_id, stock_id, side, quantity, price, fee, traded_at, note, source)
           VALUES ($1,$2,'sell',$3,$4,0,$5,'ปิดสถานะ (จาก Turso)','turso')`,
          [portfolioId, stockId, soldQty, soldPrice, soldDate]
        );
        sells++;
      }

      // แนวรับ/แนวต้าน เอาเฉพาะไม้ที่ยังเปิดอยู่
      if (t.status !== 'CLOSED') {
        for (const [kind, price, label] of [
          ['support', norm(t.cut_loss), 'Cut loss'],
          ['resistance', norm(t.target), 'เป้าหมายขาย'],
        ] as const) {
          if (price <= 0) continue;
          const k = `${sym}|${kind}|${price}`;
          if (levelSeen.has(k)) continue;
          levelSeen.add(k);
          await q(
            `INSERT INTO gp_levels (stock_id, kind, price, label, priority, source)
             VALUES ($1,$2,$3,$4,$5,'turso')`,
            [stockId, kind, price, label, kind === 'support' ? 1 : 2]
          );
          levels++;
        }
      }
    }
  });

  // สัดส่วนเป้าหมายไม่ sync จาก Turso แล้ว
  // target_alloc ในชีตเป็นฟิลด์ legacy (schema ต้นทางระบุเองว่าเลิกใช้)
  // ของจริงตั้งเป็น "หมวด" ในหน้าเว็บ เก็บที่ gp_target_groups
  const allocs = new Map<string, number>();
  const targetTotal = 0;

  // ---- เงินตั้งต้น = เงินสูงสุดที่เคยลงพร้อมกัน ----
  const flows: { date: string; amount: number }[] = [];
  for (const t of usable) {
    flows.push({ date: cleanDate(t.buy_date)!, amount: norm(t.quantity) * norm(t.price) });
    const sd = cleanDate(t.sold_date);
    if (sd && norm(t.sold_qty) > 0 && norm(t.sold_price) > 0) {
      flows.push({ date: sd, amount: -(norm(t.sold_qty) * norm(t.sold_price)) });
    }
  }
  flows.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  let peak = 0;
  for (const f of flows) {
    running += f.amount;
    peak = Math.max(peak, running);
  }
  const capital = Math.ceil(peak / 100) * 100;
  await query(`UPDATE gp_portfolios SET initial_cash = $1 WHERE id = $2`, [capital, portfolioId]);

  const latestTradeDate =
    usable.length > 0 ? cleanDate(usable[usable.length - 1].buy_date) : null;

  return {
    portfolioId,
    portfolioName,
    stocks: symbols.length,
    buys,
    sells,
    levels,
    targets: allocs.size,
    skipped,
    latestTradeDate,
    targetTotal,
    warnings: [...new Set(warnings)],
  };
}
