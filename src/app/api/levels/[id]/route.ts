import { query } from '@/lib/db';
import { fail, handle, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();

    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };

    if (body.price !== undefined) {
      const p = num(body.price);
      if (!p || p <= 0) return fail('ราคาแนวต้องมากกว่า 0');
      set('price', p);
    }
    if (body.kind !== undefined) set('kind', body.kind === 'resistance' ? 'resistance' : 'support');
    if (body.label !== undefined) set('label', str(body.label));
    if (body.priority !== undefined)
      set('priority', Math.min(3, Math.max(1, num(body.priority, 2) ?? 2)));
    if (body.is_active !== undefined) set('is_active', Boolean(body.is_active));

    if (!sets.length) return fail('ไม่มีข้อมูลที่จะแก้ไข');
    vals.push(Number(id));

    const rows = await query(
      `UPDATE gp_levels SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return fail('ไม่พบแนวนี้', 404);
    return ok(rows[0]);
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const rows = await query(`DELETE FROM gp_levels WHERE id = $1 RETURNING id`, [Number(id)]);
    if (!rows.length) return fail('ไม่พบแนวนี้', 404);
    return ok({ deleted: rows[0].id });
  } catch (err) {
    return handle(err);
  }
}
