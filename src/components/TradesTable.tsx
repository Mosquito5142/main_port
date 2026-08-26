'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Trade } from '@/lib/types';
import { fmtDate, fmtMoney, fmtQty } from '@/lib/format';

export default function TradesTable({
  trades,
  showPortfolio = true,
}: {
  trades: Trade[];
  showPortfolio?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function remove(id: number) {
    if (!confirm('ลบรายการซื้อขายนี้?')) return;
    setBusy(id);
    const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) {
      alert('ลบไม่สำเร็จ');
      return;
    }
    router.refresh();
  }

  if (!trades.length)
    return (
      <div className="rounded-2xl border border-dashed border-leaf bg-mist/40 px-4 py-10 text-center text-sm text-forest/50">
        ยังไม่มีรายการซื้อขาย
      </div>
    );

  return (
    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th>วันที่</th>
            {showPortfolio && <th>พอร์ต</th>}
            <th>หุ้น</th>
            <th>ประเภท</th>
            <th className="num">จำนวน</th>
            <th className="num">ราคา</th>
            <th className="num">ค่าธรรมเนียม</th>
            <th className="num">มูลค่ารวม</th>
            <th>โน้ต</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const gross =
              Number(t.quantity) * Number(t.price) +
              (t.side === 'buy' ? Number(t.fee ?? 0) : -Number(t.fee ?? 0));
            return (
              <tr key={t.id}>
                <td className="whitespace-nowrap tabular-nums">{fmtDate(t.traded_at)}</td>
                {showPortfolio && (
                  <td className="whitespace-nowrap text-forest/70">{t.portfolio_name ?? '—'}</td>
                )}
                <td>
                  <Link
                    href={`/stocks/${encodeURIComponent(t.symbol ?? '')}`}
                    className="font-bold text-forest hover:underline"
                  >
                    {t.symbol}
                  </Link>
                </td>
                <td>
                  <span
                    className={
                      t.side === 'buy'
                        ? 'badge bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'badge bg-amber-50 text-amber-800 border border-amber-200'
                    }
                  >
                    {t.side === 'buy' ? 'ซื้อ' : 'ขาย'}
                  </span>
                </td>
                <td className="num">{fmtQty(t.quantity)}</td>
                <td className="num">{fmtMoney(t.price)}</td>
                <td className="num text-forest/55">{fmtMoney(t.fee)}</td>
                <td className="num font-semibold">{fmtMoney(gross)}</td>
                <td className="max-w-[200px] truncate text-xs text-forest/50">{t.note ?? '—'}</td>
                <td className="text-right">
                  <button
                    className="btn-ghost btn-xs"
                    onClick={() => remove(t.id)}
                    disabled={busy === t.id}
                    title="ลบรายการนี้"
                    aria-label={`ลบรายการ${t.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${t.symbol}`}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
