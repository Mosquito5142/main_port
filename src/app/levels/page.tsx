import Link from 'next/link';
import { query } from '@/lib/db';
import { getLevelProximity, listStocks } from '@/lib/portfolio';
import { fmtMoney } from '@/lib/format';
import { Empty, PageHeader, Stat, StatusPill } from '@/components/ui';
import LevelQuickAdd from '@/components/LevelQuickAdd';
import RefreshButton from '@/components/RefreshButton';
import DeleteButton from '@/components/DeleteButton';
import NativeCurrencyNote from '@/components/NativeCurrencyNote';

export const dynamic = 'force-dynamic';

export default async function LevelsPage() {
  // ไม่ดึงราคาหุ้นทุกตัวในระบบมาที่นี่ — getLevelProximity ดึงเฉพาะตัวที่มีแนวอยู่แล้ว
  // ส่วน dropdown "เพิ่มแนว" ไปดึงราคาเฉพาะตัวที่เลือกเองฝั่ง client
  const [levels, stocks, orphanRows] = await Promise.all([
    getLevelProximity(false),
    listStocks(),
    // หุ้นเศษที่ค้างจากการนำเข้าโพย: ไม่มีเทรด ไม่มีแนว ไม่อยู่ในหมวดเป้าหมาย
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM gp_stocks s
        WHERE s.id NOT IN (SELECT stock_id FROM gp_trades)
          AND s.id NOT IN (SELECT stock_id FROM gp_levels)
          AND s.symbol NOT IN (SELECT symbol FROM gp_group_symbols)`
    ),
  ]);
  const orphanCount = orphanRows[0]?.n ?? 0;

  const active = levels.filter((l) => l.status !== 'unknown');
  const hit = active.filter((l) => l.status === 'hit');
  const near = active.filter((l) => l.status === 'near');
  const watch = active.filter((l) => l.status === 'watch');

  const importedCount = levels.filter((l) => l.source === 'signal_import').length;
  const tursoCount = levels.filter((l) => l.source === 'turso').length;

  return (
    <>
      <PageHeader
        title="เรดาร์แนวรับ–แนวต้าน"
        emoji="🎯"
        subtitle="เรียงตามหุ้นที่ราคาเข้าใกล้จุดที่เรารอมากที่สุด (เทียบกับราคาสดจาก Yahoo Finance)"
        action={
          <div className="flex items-center gap-2">
            {levels.length > 0 && (
              <DeleteButton
                url="/api/levels"
                confirmText={`ลบแนวรับ–แนวต้านทั้งหมด ${levels.length} เส้นทิ้ง?${
                  tursoCount > 0
                    ? `\n\nรวม ${tursoCount} เส้นที่ sync มาจาก Turso ด้วย — ถ้าต้องการกลับมา กด "ดึงข้อมูลล่าสุดจากชีต" ที่หน้าภาพรวมได้ใหม่`
                    : ''
                }${
                  importedCount > 0
                    ? `\nส่วน ${importedCount} เส้นที่นำเข้าจากโพย จะกู้คืนไม่ได้ เว้นแต่นำเข้าโพยเดิมซ้ำอีกครั้ง`
                    : ''
                }`}
                label="🗑 ล้างทั้งหมด"
                className="btn-danger btn-xs"
              />
            )}
            {orphanCount > 0 && (
              <DeleteButton
                url="/api/stocks/cleanup"
                confirmText={`ลบหุ้นที่ไม่ได้ใช้แล้ว ${orphanCount} ตัวทิ้ง?\n\nนับเฉพาะหุ้นที่ไม่มีรายการซื้อขาย ไม่มีแนวรับ–แนวต้าน และไม่อยู่ในหมวดเป้าหมาย\n(ส่วนใหญ่เป็นเศษที่ค้างจากการนำเข้าโพย ทำให้ทุกหน้าโหลดช้าลง)`}
                label={`🧹 ล้างหุ้นที่ไม่ได้ใช้ (${orphanCount})`}
                className="btn-soft btn-xs"
              />
            )}
            <RefreshButton autoSeconds={60} />
          </div>
        }
      />

      <NativeCurrencyNote reason="แนวรับ–แนวต้านเป็นราคาต่อหุ้น ต้องเทียบกับราคาจริงของตลาดนั้น" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat accent label="ถึงจุดแล้ว (≤1%)" value={hit.length} sub="ควรเช็กทันที" />
        <Stat label="ใกล้มาก (≤3%)" value={near.length} sub="เตรียมตัวได้" />
        <Stat label="เฝ้าดู (≤7%)" value={watch.length} sub="ยังพอมีเวลา" />
        <Stat label="แนวทั้งหมด" value={levels.length} sub={`${stocks.length} หุ้นในระบบ`} />
      </div>

      <div className="mb-6">
        <LevelQuickAdd
          stocks={stocks.map((s) => ({ id: s.id, symbol: s.symbol, name: s.name }))}
        />
      </div>

      {levels.length === 0 ? (
        <Empty
          title="ยังไม่มีแนวรับ–แนวต้าน"
          hint="เพิ่มจากฟอร์มด้านบน หรือเข้าไปตั้งในหน้ารายละเอียดของหุ้นแต่ละตัว"
          href="/trades"
          cta="ไปบันทึกซื้อขาย"
        />
      ) : (
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>สถานะ</th>
                <th>หุ้น</th>
                <th>ประเภท</th>
                <th className="num">ราคาแนว</th>
                <th className="num">ราคาล่าสุด</th>
                <th className="num">ห่างจากแนว</th>
                <th>ระยะทาง</th>
                <th>โน้ต</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                const pct = l.distancePct;
                const abs = pct === null ? null : Math.abs(pct);
                const bar = abs === null ? 0 : Math.max(0, 100 - Math.min(100, (abs / 15) * 100));
                return (
                  <tr key={l.level_id} className={!l.currentPrice ? 'opacity-60' : ''}>
                    <td>
                      <StatusPill status={l.status} />
                    </td>
                    <td>
                      <Link
                        href={`/stocks/${encodeURIComponent(l.symbol)}`}
                        className="flex flex-col leading-tight"
                      >
                        <span className="font-bold text-forest hover:underline">{l.symbol}</span>
                        <span className="max-w-[180px] truncate text-xs text-forest/45">
                          {l.name ?? '—'}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span
                        className={
                          l.kind === 'support'
                            ? 'badge bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'badge bg-rose-50 text-rose-700 border border-rose-200'
                        }
                      >
                        {l.kind === 'support' ? 'แนวรับ' : 'แนวต้าน'}
                      </span>
                    </td>
                    <td className="num font-bold">{fmtMoney(l.price)}</td>
                    <td className="num">{fmtMoney(l.currentPrice)}</td>
                    <td className="num font-semibold">
                      {abs === null ? (
                        '—'
                      ) : (
                        <span
                          className={
                            abs <= 1
                              ? 'text-rose-600'
                              : abs <= 3
                                ? 'text-amber-700'
                                : 'text-forest/70'
                          }
                        >
                          {pct! > 0 ? 'สูงกว่า ' : 'ต่ำกว่า '}
                          {abs.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="w-[140px]">
                      <div className="meter">
                        <span style={{ width: `${bar}%` }} />
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate text-xs text-forest/50">
                      {l.label ?? '—'}
                    </td>
                    <td className="text-right">
                      <DeleteButton
                        url={`/api/levels/${l.level_id}`}
                        confirmText={`ลบแนว ${l.symbol} @ ${l.price}?`}
                        ariaLabel={`ลบแนว ${l.symbol} ที่ราคา ${l.price}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
