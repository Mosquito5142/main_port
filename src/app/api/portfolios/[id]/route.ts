import { query } from '@/lib/db';
import { getPortfolioView } from '@/lib/portfolio';
import { fail, handle, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const view = await getPortfolioView(Number(id));
    if (!view) return fail('ไม่พบพอร์ตนี้', 404);
    return ok(view);
  } catch (err) {
    return handle(err);
  }
}

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

    if (body.name !== undefined) {
      const name = str(body.name);
      if (!name) return fail('ชื่อพอร์ตห้ามว่าง');
      set('name', name);
    }
    if (body.kind !== undefined) set('kind', body.kind === 'main' ? 'main' : 'plan');
    if (body.description !== undefined) set('description', str(body.description));
    if (body.currency !== undefined) set('currency', str(body.currency) ?? 'THB');
    if (body.initial_cash !== undefined) set('initial_cash', num(body.initial_cash, 0));
    if (body.color !== undefined) set('color', str(body.color) ?? '#66BB6A');
    if (body.is_archived !== undefined) set('is_archived', Boolean(body.is_archived));

    if (!sets.length) return fail('ไม่มีข้อมูลที่จะแก้ไข');
    vals.push(Number(id));

    const rows = await query(
      `UPDATE gp_portfolios SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return fail('ไม่พบพอร์ตนี้', 404);
    return ok(rows[0]);
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const rows = await query(`DELETE FROM gp_portfolios WHERE id = $1 RETURNING id`, [Number(id)]);
    if (!rows.length) return fail('ไม่พบพอร์ตนี้', 404);
    return ok({ deleted: rows[0].id });
  } catch (err) {
    return handle(err);
  }
}
