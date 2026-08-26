import { query } from '@/lib/db';
import { fail, handle, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const rows = await query(
      `UPDATE gp_stocks SET
         name = COALESCE($2, name),
         sector = COALESCE($3, sector),
         note = COALESCE($4, note)
       WHERE id = $1 RETURNING *`,
      [Number(id), str(body.name), str(body.sector), str(body.note)]
    );
    if (!rows.length) return fail('ไม่พบหุ้นตัวนี้', 404);
    return ok(rows[0]);
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const rows = await query(`DELETE FROM gp_stocks WHERE id = $1 RETURNING id`, [Number(id)]);
    if (!rows.length) return fail('ไม่พบหุ้นตัวนี้', 404);
    return ok({ deleted: rows[0].id });
  } catch (err) {
    return handle(err);
  }
}
