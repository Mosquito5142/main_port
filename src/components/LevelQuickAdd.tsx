'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LevelQuickAdd({
  stocks,
}: {
  stocks: { id: number; symbol: string; name: string | null }[];
}) {
  const router = useRouter();
  const [stockId, setStockId] = useState<string>(String(stocks[0]?.id ?? ''));
  const [kind, setKind] = useState('support');
  const [price, setPrice] = useState('');
  const [label, setLabel] = useState('');
  const [priority, setPriority] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = stocks.find((s) => String(s.id) === stockId);

  // ดึงราคาเฉพาะตัวที่เลือก — เมื่อก่อนหน้านี้ดึงราคาหุ้นทุกตัวในระบบมาทำ dropdown
  // ซึ่งพอมีหุ้นหลายร้อยตัวทำให้หน้าโหลดนานเป็นสิบวินาที
  const [hintPrice, setHintPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!current?.symbol) {
      setHintPrice(null);
      return;
    }
    let alive = true;
    setHintPrice(null);
    fetch(`/api/quotes?symbols=${encodeURIComponent(current.symbol)}`)
      .then((r) => r.json())
      .then((rows) => alive && setHintPrice(rows?.[0]?.price ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [current?.symbol]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_id: Number(stockId),
          kind,
          price: Number(price),
          label: label || null,
          priority: Number(priority),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setPrice('');
      setLabel('');
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!stocks.length)
    return (
      <div className="card card-pad text-sm text-forest/60">
        ยังไม่มีหุ้นในระบบ — บันทึกรายการซื้อขายอย่างน้อย 1 รายการที่หน้า “บันทึกซื้อขาย” ก่อน
      </div>
    );

  return (
    <form onSubmit={submit} className="card card-pad">
      <h3 className="card-title mb-3">เพิ่มแนวรับ / แนวต้าน</h3>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <label className="label">หุ้น</label>
          <select className="select" value={stockId} onChange={(e) => setStockId(e.target.value)}>
            {stocks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.symbol}
                {s.name ? ` · ${s.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ประเภท</label>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="support">🟢 แนวรับ</option>
            <option value="resistance">🔴 แนวต้าน</option>
          </select>
        </div>
        <div>
          <label className="label">
            ราคา
            {hintPrice !== null && (
              <button
                type="button"
                onClick={() => setPrice(String(hintPrice))}
                className="ml-1 font-normal normal-case text-grass hover:underline"
                title="ใส่ราคาตลาดล่าสุด"
              >
                (ล่าสุด {hintPrice})
              </button>
            )}
          </label>
          <input
            className="input tabular-nums"
            type="number"
            step="0.0001"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={hintPrice !== null ? String(hintPrice) : '0.00'}
            required
          />
        </div>
        <div>
          <label className="label">ความสำคัญ</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="1">สูง</option>
            <option value="2">กลาง</option>
            <option value="3">ต่ำ</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={busy || !price}>
            ＋ เพิ่ม
          </button>
        </div>
        <div className="sm:col-span-6">
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="โน้ต (ไม่บังคับ) เช่น แนวรับเดิมเดือน มี.ค. / เส้น EMA200"
          />
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
    </form>
  );
}
