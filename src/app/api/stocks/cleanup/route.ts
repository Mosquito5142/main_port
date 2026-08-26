import { query } from '@/lib/db';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * หุ้น "กำพร้า" = ไม่มีรายการซื้อขาย ไม่มีแนวรับ–แนวต้าน และไม่อยู่ในหมวดเป้าหมาย
 *
 * ส่วนใหญ่เกิดจากการนำเข้าโพย ซึ่งสร้างแถวหุ้นให้ทุก ticker ที่วางเข้ามา
 * พอลบแนวทิ้งทีหลัง แถวหุ้นยังค้างอยู่ ทำให้หน้าเว็บที่วนอ่านหุ้นทุกตัวช้าลงเรื่อย ๆ
 */
const ORPHAN_WHERE = `
  s.id NOT IN (SELECT stock_id FROM gp_trades)
  AND s.id NOT IN (SELECT stock_id FROM gp_levels)
  AND s.symbol NOT IN (SELECT symbol FROM gp_group_symbols)
`;

export async function GET() {
  try {
    const [orphans, total] = await Promise.all([
      query<{ n: number }>(`SELECT COUNT(*) AS n FROM gp_stocks s WHERE ${ORPHAN_WHERE}`),
      query<{ n: number }>(`SELECT COUNT(*) AS n FROM gp_stocks`),
    ]);
    return ok({ orphans: orphans[0]?.n ?? 0, total: total[0]?.n ?? 0 });
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE() {
  try {
    const rows = await query<{ id: number }>(
      `DELETE FROM gp_stocks WHERE id IN (SELECT s.id FROM gp_stocks s WHERE ${ORPHAN_WHERE}) RETURNING id`
    );
    // ล้าง cache ราคาที่ไม่มีหุ้นอ้างถึงแล้วด้วย
    await query(
      `DELETE FROM gp_price_cache WHERE symbol NOT IN (SELECT symbol FROM gp_stocks)`
    ).catch(() => undefined);
    return ok({ deleted: rows.length });
  } catch (err) {
    return handle(err);
  }
}
