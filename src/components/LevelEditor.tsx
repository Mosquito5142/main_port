'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtMoney } from '@/lib/format';
import type { Level } from '@/lib/types';

export default function LevelEditor({
  stockId,
  symbol,
  levels,
  currentPrice,
}: {
  stockId: number;
  symbol: string;
  levels: Level[];
  currentPrice: number | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<'support' | 'resistance'>('support');
  const [price, setPrice] = useState('');
  const [label, setLabel] = useState('');
  const [priority, setPriority] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_id: stockId,
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

  async function toggle(l: Level) {
    await fetch(`/api/levels/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !l.is_active }),
    });
    router.refresh();
  }

  async function remove(id: number) {
    if (!confirm('ลบแนวนี้?')) return;
    await fetch(`/api/levels/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  const supports = levels.filter((l) => l.kind === 'support').sort((a, b) => b.price - a.price);
  const resistances = levels
    .filter((l) => l.kind === 'resistance')
    .sort((a, b) => a.price - b.price);

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-2 sm:col-span-2">
          <label className="label">ประเภท</label>
          <select
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'support' | 'resistance')}
          >
            <option value="support">🟢 แนวรับ (รอซื้อ)</option>
            <option value="resistance">🔴 แนวต้าน (รอขาย)</option>
          </select>
        </div>
        <div>
          <label className="label">ราคา</label>
          <input
            className="input"
            type="number"
            step="0.0001"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={currentPrice ? String(currentPrice) : '0.00'}
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
        <div className="col-span-2 sm:col-span-1">
          <label className="label">โน้ต</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="เช่น เส้น EMA50"
          />
        </div>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button className="btn-primary w-full" disabled={busy || !price}>
            ＋ เพิ่มแนว
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <LevelColumn
          title="🔴 แนวต้าน"
          rows={resistances}
          currentPrice={currentPrice}
          onToggle={toggle}
          onRemove={remove}
        />
        <LevelColumn
          title="🟢 แนวรับ"
          rows={supports}
          currentPrice={currentPrice}
          onToggle={toggle}
          onRemove={remove}
        />
      </div>
      {levels.length === 0 && (
        <div className="rounded-xl border border-dashed border-leaf bg-mist/40 px-4 py-6 text-center text-sm text-forest/50">
          ยังไม่มีแนวรับ–แนวต้านของ {symbol}
        </div>
      )}
    </div>
  );
}

function LevelColumn({
  title,
  rows,
  currentPrice,
  onToggle,
  onRemove,
}: {
  title: string;
  rows: Level[];
  currentPrice: number | null;
  onToggle: (l: Level) => void;
  onRemove: (id: number) => void;
}) {
  if (!rows.length) return null;
  const PRIORITY = ['', 'สูง', 'กลาง', 'ต่ำ'];
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-forest/60">{title}</h4>
      <div className="space-y-2">
        {rows.map((l) => {
          const dist =
            currentPrice && l.price ? ((currentPrice - l.price) / l.price) * 100 : null;
          return (
            <div
              key={l.id}
              className={[
                'flex items-center justify-between gap-2 rounded-xl border px-3 py-2',
                l.is_active ? 'border-leaf/60 bg-surface/70' : 'border-slate-200 bg-slate-50 opacity-60',
              ].join(' ')}
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold tabular-nums text-forest">{fmtMoney(l.price)}</span>
                  <span className="text-[10px] uppercase tracking-wide text-forest/40">
                    {PRIORITY[l.priority] ?? ''}
                  </span>
                </div>
                <div className="truncate text-xs text-forest/50">
                  {l.label ?? '—'}
                  {dist !== null && (
                    <span className="ml-1 text-forest/40">
                      · ห่าง {Math.abs(dist).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className="btn-ghost btn-xs"
                  onClick={() => onToggle(l)}
                  title={l.is_active ? 'ปิดการแจ้งเตือน' : 'เปิดการแจ้งเตือน'}
                  aria-label={
                    l.is_active
                      ? `ปิดการแจ้งเตือนแนวที่ ${fmtMoney(l.price)}`
                      : `เปิดการแจ้งเตือนแนวที่ ${fmtMoney(l.price)}`
                  }
                >
                  {l.is_active ? '🔔' : '🔕'}
                </button>
                <button
                  className="btn-ghost btn-xs"
                  onClick={() => onRemove(l.id)}
                  title="ลบแนวนี้"
                  aria-label={`ลบแนวที่ ${fmtMoney(l.price)}`}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
