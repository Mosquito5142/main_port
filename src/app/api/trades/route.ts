import { query } from '@/lib/db';
import { listTrades } from '@/lib/portfolio';
import { getQuote } from '@/lib/yahoo';
import { fail, handle, normalizeSymbol, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const pid = sp.get('portfolio_id');
    const sid = sp.get('stock_id');
    return ok(
      await listTrades(pid ? Number(pid) : undefined, sid ? Number(sid) : undefined)
    );
  } catch (err) {
    return handle(err);
  }
}

/** รับได้ทั้ง stock_id หรือ symbol (ถ้ายังไม่มีหุ้นในระบบจะสร้างให้อัตโนมัติ) */
async function resolveStockId(body: any): Promise<number | { error: string }> {
  if (body.stock_id) return Number(body.stock_id);
  const symbol = normalizeSymbol(body.symbol);
  if (!symbol) return { error: 'กรุณาเลือกหุ้น' };

  const existing = await query<{ id: number }>(
    `SELECT id FROM gp_stocks WHERE symbol = $1`,
    [symbol]
  );
  if (existing.length) return existing[0].id;

  let name: string | null = null;
  let currency: string | null = null;
  let exchange: string | null = null;
  try {
    const q = await getQuote(symbol);
    name = q.shortName;
    currency = q.currency;
    exchange = q.exchange;
  } catch {
    /* ไม่เป็นไร */
  }
  const rows = await query<{ id: number }>(
    `INSERT INTO gp_stocks (symbol, name, currency, exchange) VALUES ($1,$2,$3,$4) RETURNING id`,
    [symbol, name, currency, exchange]
  );
  return rows[0].id;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const portfolioId = num(body.portfolio_id);
    if (!portfolioId) return fail('กรุณาเลือกพอร์ต');

    const side = body.side === 'sell' ? 'sell' : 'buy';
    const quantity = num(body.quantity);
    const price = num(body.price);
    if (!quantity || quantity <= 0) return fail('จำนวนหุ้นต้องมากกว่า 0');
    if (price === null || price < 0) return fail('ราคาไม่ถูกต้อง');

    const resolved = await resolveStockId(body);
    if (typeof resolved !== 'number') return fail(resolved.error);

    if (side === 'sell') {
      const held = await query<{ qty: number }>(
        `SELECT COALESCE(SUM(CASE WHEN side='buy' THEN quantity ELSE -quantity END), 0) AS qty
           FROM gp_trades WHERE portfolio_id = $1 AND stock_id = $2`,
        [portfolioId, resolved]
      );
      const qty = Number(held[0]?.qty ?? 0);
      if (quantity > qty + 1e-9)
        return fail(`ขายเกินจำนวนที่ถืออยู่ (ถืออยู่ ${qty})`);
    }

    const rows = await query(
      `INSERT INTO gp_trades (portfolio_id, stock_id, side, quantity, price, fee, traded_at, note)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7, date('now')), $8) RETURNING *`,
      [
        portfolioId,
        resolved,
        side,
        quantity,
        price,
        num(body.fee, 0),
        str(body.traded_at),
        str(body.note),
      ]
    );
    return ok(rows[0], { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
