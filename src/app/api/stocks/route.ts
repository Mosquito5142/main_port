import { query } from '@/lib/db';
import { getQuote } from '@/lib/yahoo';
import { fail, handle, normalizeSymbol, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(await query(`SELECT * FROM gp_stocks ORDER BY symbol`));
  } catch (err) {
    return handle(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const symbol = normalizeSymbol(body.symbol);
    if (!symbol) return fail('กรุณาใส่สัญลักษณ์หุ้น เช่น PTT.BK หรือ AAPL');

    // เติมชื่อ/สกุลเงินอัตโนมัติจาก Yahoo (ถ้าดึงได้)
    let name = str(body.name);
    let currency = str(body.currency);
    let exchange = str(body.exchange);
    try {
      const q = await getQuote(symbol);
      if (!q.price && !q.shortName) {
        return fail(`ไม่พบสัญลักษณ์ "${symbol}" บน Yahoo Finance`, 404);
      }
      name = name ?? q.shortName;
      currency = currency ?? q.currency;
      exchange = exchange ?? q.exchange;
    } catch {
      // เพิ่มได้แม้ดึงราคาไม่สำเร็จ
    }

    const rows = await query(
      `INSERT INTO gp_stocks (symbol, name, exchange, currency, sector, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (symbol) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, gp_stocks.name),
         exchange = COALESCE(EXCLUDED.exchange, gp_stocks.exchange),
         currency = COALESCE(EXCLUDED.currency, gp_stocks.currency),
         sector = COALESCE(EXCLUDED.sector, gp_stocks.sector),
         note = COALESCE(EXCLUDED.note, gp_stocks.note)
       RETURNING *`,
      [symbol, name, exchange, currency, str(body.sector), str(body.note)]
    );
    return ok(rows[0], { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
