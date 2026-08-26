import { fetchTursoStocks, tursoConfigured } from '@/lib/turso';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * รายชื่อหุ้น + หมวด (category) จากตาราง stocks จริงของ Turso
 * (คอลัมน์ category = "แอดอั้ม" / "จารย์ Shay" ฯลฯ ตามที่ตั้งไว้ในชีต Stock_Master)
 * ใช้ทำตัวกรองหมวดในหน้า "นำเข้าโพย"
 */
export async function GET() {
  try {
    if (!tursoConfigured()) return ok({ entries: [] });
    const stocks = await fetchTursoStocks();
    const entries = stocks
      .filter((s) => s.symbol)
      .map((s) => ({
        symbol: s.symbol.toUpperCase().trim(),
        category: s.category?.trim() || 'ไม่มีหมวด',
      }));
    return ok({ entries });
  } catch (err) {
    return handle(err);
  }
}
