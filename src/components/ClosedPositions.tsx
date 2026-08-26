import Link from 'next/link';
import type { Position } from '@/lib/types';
import { fmtMoney, toneClass } from '@/lib/format';

export default function ClosedPositions({
  positions,
  currency = 'USD',
}: {
  positions: Position[];
  currency?: string;
}) {
  if (!positions.length) return null;

  const total = positions.reduce((a, b) => a + b.realizedPnl, 0);
  const wins = positions.filter((p) => p.realizedPnl > 0).length;

  return (
    <details className="card card-pad group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <span className="card-title">
          หุ้นที่ปิดสถานะแล้ว ({positions.length} ตัว)
          <span className="ml-2 font-normal normal-case tracking-normal text-forest/45">
            กดเพื่อดูรายละเอียด
          </span>
        </span>
        <span className="flex items-center gap-4 text-sm">
          <span className="text-forest/55">
            ชนะ <b className="text-forest">{wins}</b> / {positions.length} ตัว
          </span>
          <span className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-forest/45">
              กำไรจากตัวที่ขายหมดแล้ว
            </span>
            <span className={`text-lg font-extrabold tabular-nums ${toneClass(total)}`}>
              {fmtMoney(total)} {currency}
            </span>
          </span>
        </span>
      </summary>

      <p className="mt-3 text-xs text-forest/50">
        นับเฉพาะหุ้นที่ขายออกไปหมดแล้ว — หุ้นที่ขายบางส่วนแล้วยังถืออยู่ (เช่นไม้เก่าที่ปิดไป)
        กำไรที่รับรู้จะไปรวมอยู่ในช่อง “กำไรที่รับรู้แล้ว” ของพอร์ตแทน
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {positions.map((p) => (
          <Link
            key={p.stock_id}
            href={`/stocks/${encodeURIComponent(p.symbol)}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-leaf/60 bg-surface/70 px-3 py-2 transition hover:border-grass"
          >
            <span className="min-w-0">
              <span className="font-bold text-forest">{p.symbol}</span>
              <span className="ml-2 text-xs text-forest/40">
                ราคาตอนนี้ {fmtMoney(p.price)}
              </span>
            </span>
            <span className={`shrink-0 font-bold tabular-nums ${toneClass(p.realizedPnl)}`}>
              {fmtMoney(p.realizedPnl)}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}
