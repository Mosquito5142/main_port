import { query, tx } from '@/lib/db';
import { fail, handle, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const pid = new URL(req.url).searchParams.get('portfolio_id');
    if (!pid) return fail('ต้องระบุ portfolio_id');
    return ok(
      await query(
        `SELECT t.*, s.symbol, s.name AS stock_name
           FROM gp_targets t JOIN gp_stocks s ON s.id = t.stock_id
          WHERE t.portfolio_id = $1 ORDER BY t.target_percent DESC`,
        [Number(pid)]
      )
    );
  } catch (err) {
    return handle(err);
  }
}

/** บันทึกสัดส่วนเป้าหมายทั้งชุด: { portfolio_id, targets: [{stock_id, target_percent, note}] } */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const pid = num(body.portfolio_id);
    if (!pid) return fail('ต้องระบุ portfolio_id');
    const items: any[] = Array.isArray(body.targets) ? body.targets : [];

    const total = items.reduce((a, i) => a + (num(i.target_percent, 0) ?? 0), 0);
    if (total > 100.0001) return fail(`สัดส่วนรวมเกิน 100% (ตอนนี้ ${total.toFixed(2)}%)`);

    await tx(async (q) => {
      await q(`DELETE FROM gp_targets WHERE portfolio_id = $1`, [pid]);
      for (const i of items) {
        const stockId = num(i.stock_id);
        const pct = num(i.target_percent, 0) ?? 0;
        if (!stockId || pct <= 0) continue;
        await q(
          `INSERT INTO gp_targets (portfolio_id, stock_id, target_percent, note)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (portfolio_id, stock_id)
           DO UPDATE SET target_percent = EXCLUDED.target_percent, note = EXCLUDED.note, updated_at = datetime('now')`,
          [pid, stockId, pct, str(i.note)]
        );
      }
    });

    return ok({ saved: items.length, total });
  } catch (err) {
    return handle(err);
  }
}
