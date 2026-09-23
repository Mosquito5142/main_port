import { query, one } from '@/lib/db';
import { fail, handle, num, ok, str } from '@/lib/api';
import { QTY_EPSILON } from '@/lib/calc';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const rows = await query(`DELETE FROM gp_trades WHERE id = $1 RETURNING id`, [Number(id)]);
    if (!rows.length) return fail('ไม่พบรายการนี้', 404);
    return ok({ deleted: rows[0].id });
  } catch (err) {
    return handle(err);
  }
}

interface TradeRow {
  id: number;
  portfolio_id: number;
  stock_id: number;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  traded_at: string;
  note: string | null;
}

/** แก้ไขรายการซื้อขายที่บันทึกผิด — ใช้ตอนรู้ทีหลังว่ายอดไม่ตรง (ราคา/จำนวน/วันที่/โน้ตพิมพ์ผิด) */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    const existing = await one<TradeRow>(`SELECT * FROM gp_trades WHERE id = $1`, [id]);
    if (!existing) return fail('ไม่พบรายการนี้', 404);

    const body = await req.json().catch(() => ({}));

    const side = body.side === undefined ? existing.side : body.side === 'sell' ? 'sell' : 'buy';
    const quantity = body.quantity === undefined ? existing.quantity : num(body.quantity);
    const price = body.price === undefined ? existing.price : num(body.price);
    const fee = body.fee === undefined ? existing.fee : num(body.fee, 0);
    const traded_at = body.traded_at === undefined ? existing.traded_at : str(body.traded_at);
    const note = body.note === undefined ? existing.note : str(body.note);

    if (!quantity || quantity <= 0) return fail('จำนวนหุ้นต้องมากกว่า 0');
    if (price === null || price < 0) return fail('ราคาไม่ถูกต้อง');
    if (fee === null || fee < 0) return fail('ค่าธรรมเนียมติดลบไม่ได้');
    if (!traded_at) return fail('ต้องระบุวันที่');

    // จำลองลำดับรายการทั้งหมดของหุ้นตัวนี้ในพอร์ตนี้ใหม่ (แทนที่รายการนี้ด้วยค่าที่แก้)
    // เพื่อกันไม่ให้แก้แล้วเกิด "ขายเกินที่มี ณ จุดใดจุดหนึ่ง" — เรียงแบบเดียวกับที่คำนวณต้นทุนเฉลี่ยจริง (traded_at, id)
    const siblings = await query<TradeRow>(
      `SELECT * FROM gp_trades WHERE portfolio_id = $1 AND stock_id = $2`,
      [existing.portfolio_id, existing.stock_id]
    );
    const simulated = siblings
      .map((t) => (t.id === id ? { ...t, side, quantity, price, fee, traded_at, note } : t))
      .sort(
        (a, b) => String(a.traded_at).localeCompare(String(b.traded_at)) || a.id - b.id
      );

    let held = 0;
    for (const t of simulated) {
      held += t.side === 'buy' ? Number(t.quantity) : -Number(t.quantity);
      if (held < -QTY_EPSILON) {
        return fail(
          `แก้ไม่ได้ — ถ้าแก้แบบนี้ ณ วันที่ ${t.traded_at} จะขายเกินจำนวนที่ถืออยู่ตอนนั้น (ติดลบ ${Math.abs(held).toFixed(4)} หุ้น) เช็กลำดับวันที่/จำนวนอีกที`
        );
      }
    }

    const rows = await query<TradeRow>(
      `UPDATE gp_trades SET side = $1, quantity = $2, price = $3, fee = $4, traded_at = $5, note = $6
        WHERE id = $7 RETURNING *`,
      [side, quantity, price, fee, traded_at, note, id]
    );
    return ok(rows[0]);
  } catch (err) {
    return handle(err);
  }
}
