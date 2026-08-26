import { query } from '@/lib/db';
import { getLevelProximity } from '@/lib/portfolio';
import { fail, handle, normalizeSymbol, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get('proximity') === '1') {
      return ok(await getLevelProximity(sp.get('all') !== '1'));
    }
    const stockId = sp.get('stock_id');
    return ok(
      await query(
        `SELECT l.*, s.symbol FROM gp_levels l JOIN gp_stocks s ON s.id = l.stock_id
         ${stockId ? 'WHERE l.stock_id = $1' : ''}
         ORDER BY s.symbol, l.kind, l.price DESC`,
        stockId ? [Number(stockId)] : []
      )
    );
  } catch (err) {
    return handle(err);
  }
}

/**
 * ล้างแนวรับ–แนวต้านทีเดียวหลายเส้น (ปุ่ม "ล้างทั้งหมด" ที่หน้าเรดาร์)
 * ใส่ ?source=signal_import เพื่อล้างเฉพาะแนวที่นำเข้าจากโพย (ไม่แตะแนวจริงจาก Turso)
 * ไม่ใส่ query เลย = ล้างทุกเส้นไม่ว่ามาจากไหน
 */
export async function DELETE(req: Request) {
  try {
    const source = new URL(req.url).searchParams.get('source');
    const rows = source
      ? await query<{ id: number }>(`DELETE FROM gp_levels WHERE source = $1 RETURNING id`, [
          source,
        ])
      : await query<{ id: number }>(`DELETE FROM gp_levels RETURNING id`);
    return ok({ deleted: rows.length });
  } catch (err) {
    return handle(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let stockId = num(body.stock_id);

    if (!stockId) {
      const symbol = normalizeSymbol(body.symbol);
      if (!symbol) return fail('กรุณาเลือกหุ้น');
      const found = await query<{ id: number }>(`SELECT id FROM gp_stocks WHERE symbol = $1`, [symbol]);
      if (!found.length)
        return fail(`ยังไม่มีหุ้น ${symbol} ในระบบ — บันทึกรายการซื้อขาย หรือใช้หน้า "นำเข้าโพย" ก่อน`);
      stockId = found[0].id;
    }

    const kind = body.kind === 'resistance' ? 'resistance' : 'support';
    const price = num(body.price);
    if (!price || price <= 0) return fail('ราคาแนวต้องมากกว่า 0');

    const priority = Math.min(3, Math.max(1, num(body.priority, 2) ?? 2));

    const rows = await query(
      `INSERT INTO gp_levels (stock_id, kind, price, label, priority)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [stockId, kind, price, str(body.label), priority]
    );
    return ok(rows[0], { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
