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
  const [editingId, setEditingId] = useState<number | null>(null);

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
          {trades.map((t) =>
            editingId === t.id ? (
              <EditTradeRow
                key={t.id}
                trade={t}
                showPortfolio={showPortfolio}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  router.refresh();
                }}
              />
            ) : (
              <TradeRow
                key={t.id}
                trade={t}
                showPortfolio={showPortfolio}
                busy={busy === t.id}
                onEdit={() => setEditingId(t.id)}
                onRemove={() => remove(t.id)}
              />
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function TradeRow({
  trade: t,
  showPortfolio,
  busy,
  onEdit,
  onRemove,
}: {
  trade: Trade;
  showPortfolio: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const gross =
    Number(t.quantity) * Number(t.price) +
    (t.side === 'buy' ? Number(t.fee ?? 0) : -Number(t.fee ?? 0));
  return (
    <tr>
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
        <div className="flex justify-end gap-1">
          <button
            className="btn-ghost btn-xs"
            onClick={onEdit}
            disabled={busy}
            title="แก้ไขรายการนี้"
            aria-label={`แก้ไขรายการ${t.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${t.symbol}`}
          >
            ✏️
          </button>
          <button
            className="btn-ghost btn-xs"
            onClick={onRemove}
            disabled={busy}
            title="ลบรายการนี้"
            aria-label={`ลบรายการ${t.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${t.symbol}`}
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  );
}

/** แก้ตรงในแถวเลย — ใช้ตอนรู้ทีหลังว่าพิมพ์ราคา/จำนวน/วันที่ผิด ไม่ต้องลบแล้วบันทึกใหม่
 *  คงคอลัมน์ให้ตรงกับหัวตารางเดิมทุกอัน (แค่สลับเป็นช่องกรอกแทนตัวหนังสือ) เพื่อไม่ให้เสียบริบท
 *  ว่ากำลังแก้หุ้น/พอร์ตไหนอยู่ระหว่างแก้ */
function EditTradeRow({
  trade: t,
  showPortfolio,
  onCancel,
  onSaved,
}: {
  trade: Trade;
  showPortfolio: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>(t.side);
  const [quantity, setQuantity] = useState(String(t.quantity));
  const [price, setPrice] = useState(String(t.price));
  const [fee, setFee] = useState(String(t.fee ?? 0));
  const [tradedAt, setTradedAt] = useState(t.traded_at.slice(0, 10));
  const [note, setNote] = useState(t.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gross =
    (Number(quantity) || 0) * (Number(price) || 0) +
    (side === 'buy' ? Number(fee) || 0 : -(Number(fee) || 0));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          quantity: Number(quantity),
          price: Number(price),
          fee: Number(fee || 0),
          traded_at: tradedAt,
          note: note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="bg-mist/40">
      <td>
        <input
          type="date"
          className="input w-36 py-1.5 text-sm"
          value={tradedAt}
          onChange={(e) => setTradedAt(e.target.value)}
        />
      </td>
      {showPortfolio && (
        <td className="whitespace-nowrap text-forest/50">{t.portfolio_name ?? '—'}</td>
      )}
      <td className="font-bold text-forest">{t.symbol}</td>
      <td>
        <select
          className="select w-24 py-1.5 text-sm"
          value={side}
          onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
        >
          <option value="buy">ซื้อ</option>
          <option value="sell">ขาย</option>
        </select>
      </td>
      <td className="num">
        <input
          type="number"
          step="any"
          min="0"
          className="input w-28 py-1.5 text-right text-sm tabular-nums"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </td>
      <td className="num">
        <input
          type="number"
          step="any"
          min="0"
          className="input w-24 py-1.5 text-right text-sm tabular-nums"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td className="num">
        <input
          type="number"
          step="any"
          min="0"
          className="input w-20 py-1.5 text-right text-sm tabular-nums"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </td>
      <td className="num font-semibold">{fmtMoney(gross)}</td>
      <td>
        <input
          className="input w-full min-w-[120px] py-1.5 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="—"
        />
      </td>
      <td className="text-right">
        <div className="flex justify-end gap-1">
          <button
            className="btn-primary btn-xs"
            onClick={save}
            disabled={busy}
            aria-label="บันทึกการแก้ไข"
          >
            {busy ? '…' : '💾'}
          </button>
          <button
            className="btn-soft btn-xs"
            onClick={onCancel}
            disabled={busy}
            type="button"
            aria-label="ยกเลิกการแก้ไข"
          >
            ✕
          </button>
        </div>
        {error && (
          <p className="mt-1 max-w-[220px] text-right text-[11px] text-rose-600">{error}</p>
        )}
      </td>
    </tr>
  );
}
