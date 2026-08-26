import { query } from '@/lib/db';
import { getQuote } from '@/lib/yahoo';
import { fail, handle, normalizeSymbol, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * นำเข้าแนวรับ–แนวต้านทีละหลายตัวจากข้อความ "โพย" ที่แปลงไว้แล้วฝั่ง client
 * (ดู src/lib/signals.ts สำหรับตัวแปลงข้อความ)
 *
 * body: {
 *   items: [{
 *     symbol: string,
 *     datetime: string,          // ข้อความวันที่ดิบ เช่น "25 ส.ค. 23:18"
 *     supports: number[],        // เฉพาะไม้ที่เลือกแล้ว (client กรอง tranche มาก่อน)
 *     resistances: number[],
 *   }]
 * }
 */

interface Item {
  symbol: string;
  datetime: string;
  supports: number[];
  resistances: number[];
}

/** หาหรือสร้างหุ้นให้อัตโนมัติ เหมือนตอนบันทึกรายการซื้อขาย */
async function resolveOrCreateStock(rawSymbol: string): Promise<number> {
  const symbol = normalizeSymbol(rawSymbol)!;
  const existing = await query<{ id: number }>(`SELECT id FROM gp_stocks WHERE symbol = $1`, [
    symbol,
  ]);
  if (existing.length) return existing[0].id;

  let name: string | null = null;
  let currency: string | null = null;
  let exchange: string | null = null;
  try {
    const q = await getQuote(symbol);
    name = q.shortName;
    currency = q.currency;
    exchange = q.exchange;
  } catch {
    /* เพิ่มหุ้นได้แม้ดึงราคาไม่สำเร็จ */
  }
  const rows = await query<{ id: number }>(
    `INSERT INTO gp_stocks (symbol, name, currency, exchange) VALUES ($1,$2,$3,$4) RETURNING id`,
    [symbol, name, currency, exchange]
  );
  return rows[0].id;
}

/** ไม้แรก ๆ สำคัญกว่า — ใช้จัดอันดับ priority ให้อัตโนมัติ (แก้เองทีหลังได้ที่หน้าแนวรับ–แนวต้าน) */
function priorityOf(rank: number): number {
  if (rank <= 1) return 1;
  if (rank <= 3) return 2;
  return 3;
}

const DUP_TOLERANCE = 0.005; // ราคาห่างกันไม่ถึง 0.5% ถือว่าเป็นแนวเดิม

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: Item[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return fail('ไม่มีข้อมูลให้นำเข้า');

    let created = 0;
    let skippedDuplicate = 0;
    const perStock: {
      symbol: string;
      created: number;
      skipped: number;
      error?: string;
    }[] = [];

    for (const item of items) {
      const symbol = normalizeSymbol(item.symbol);
      if (!symbol) continue;

      const supports = (item.supports ?? []).filter((n) => Number.isFinite(n) && n > 0);
      const resistances = (item.resistances ?? []).filter((n) => Number.isFinite(n) && n > 0);
      if (!supports.length && !resistances.length) continue;

      try {
        const stockId = await resolveOrCreateStock(symbol);

        const existingLevels = await query<{ kind: string; price: number }>(
          `SELECT kind, price FROM gp_levels WHERE stock_id = $1 AND is_active = 1`,
          [stockId]
        );
        const isDup = (kind: string, price: number) =>
          existingLevels.some(
            (l) => l.kind === kind && Math.abs(l.price - price) / price < DUP_TOLERANCE
          );

        let stockCreated = 0;
        let stockSkipped = 0;

        for (const [idx, price] of supports.entries()) {
          if (isDup('support', price)) {
            stockSkipped++;
            continue;
          }
          await query(
            `INSERT INTO gp_levels (stock_id, kind, price, label, priority, source)
             VALUES ($1,'support',$2,$3,$4,'signal_import')`,
            [stockId, price, `ไม้ ${idx + 1} · นำเข้าโพย ${item.datetime}`, priorityOf(idx + 1)]
          );
          stockCreated++;
        }
        for (const [idx, price] of resistances.entries()) {
          if (isDup('resistance', price)) {
            stockSkipped++;
            continue;
          }
          await query(
            `INSERT INTO gp_levels (stock_id, kind, price, label, priority, source)
             VALUES ($1,'resistance',$2,$3,$4,'signal_import')`,
            [stockId, price, `เป้าหมาย ${idx + 1} · นำเข้าโพย ${item.datetime}`, priorityOf(idx + 1)]
          );
          stockCreated++;
        }

        created += stockCreated;
        skippedDuplicate += stockSkipped;
        perStock.push({ symbol, created: stockCreated, skipped: stockSkipped });
      } catch (err) {
        perStock.push({
          symbol,
          created: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : 'ล้มเหลว',
        });
      }
    }

    return ok({
      created,
      skippedDuplicate,
      stocksTouched: perStock.filter((s) => !s.error).length,
      perStock,
    });
  } catch (err) {
    return handle(err);
  }
}
