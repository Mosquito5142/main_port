'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Portfolio } from '@/lib/types';

const COLORS = ['#1B5E20', '#2E7D32', '#43A047', '#66BB6A', '#81C784', '#A5D6A7'];

export default function PortfolioForm({
  initial,
  onDone,
}: {
  initial?: Portfolio;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [open, setOpen] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    kind: initial?.kind ?? 'plan',
    description: initial?.description ?? '',
    currency: initial?.currency ?? 'THB',
    initial_cash: String(initial?.initial_cash ?? 100000),
    color: initial?.color ?? '#66BB6A',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editing ? `/api/portfolios/${initial!.id}` : '/api/portfolios',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, initial_cash: Number(form.initial_cash || 0) }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      if (!editing) setForm((f) => ({ ...f, name: '', description: '' }));
      setOpen(editing ? false : false);
      onDone?.();
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        ＋ สร้างพอร์ตใหม่
      </button>
    );

  return (
    <form onSubmit={submit} className="card card-pad w-full space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="card-title">{editing ? 'แก้ไขพอร์ต' : 'สร้างพอร์ตใหม่'}</h3>
        <button
          type="button"
          className="btn-ghost btn-xs"
          onClick={() => {
            setOpen(false);
            onDone?.();
          }}
          aria-label="ปิดฟอร์ม"
        >
          ✕
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">ชื่อพอร์ต</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="เช่น พอร์ตหลัก / แผน B เน้นปันผล"
            required
          />
        </div>

        <div>
          <label className="label">ประเภท</label>
          <select className="select" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="main">พอร์ตหลัก (ซื้อจริง)</option>
            <option value="plan">พอร์ตจำลอง (แผนเปรียบเทียบ)</option>
          </select>
        </div>

        <div>
          <label className="label">เงินตั้งต้น</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={form.initial_cash}
            onChange={(e) => set('initial_cash', e.target.value)}
          />
        </div>

        <div>
          <label className="label">สกุลเงิน</label>
          <select
            className="select"
            value={form.currency}
            onChange={(e) => set('currency', e.target.value)}
          >
            <option>THB</option>
            <option>USD</option>
            <option>EUR</option>
            <option>JPY</option>
            <option>SGD</option>
            <option>HKD</option>
          </select>
        </div>

        <div>
          <label className="label">สีประจำพอร์ต</label>
          <div className="flex flex-wrap gap-2 pt-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className={[
                  'h-7 w-7 rounded-full border-2 transition',
                  form.color === c ? 'border-forest scale-110' : 'border-white',
                ].join(' ')}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="label">คำอธิบาย</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="เช่น ลองเอาเงินก้อนเดียวกันไปซื้อกลุ่มพลังงานแทน"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn-soft"
          onClick={() => {
            setOpen(false);
            onDone?.();
          }}
        >
          ยกเลิก
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'สร้างพอร์ต'}
        </button>
      </div>
    </form>
  );
}
