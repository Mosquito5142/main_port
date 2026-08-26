import { query } from '@/lib/db';
import { fail, handle, ok } from '@/lib/api';

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
