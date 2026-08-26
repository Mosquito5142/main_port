'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { fmtMoney, toneClass } from '@/lib/format';

export interface EditableGroup {
  key: string;
  label: string;
  targetPct: number;
  color: string;
  symbols: string[];
  isOther: boolean;
  actualPct: number;
  marketValue: number;
  actionAmount: number;
  heldSymbols: string[];
}

const PALETTE = [
  '#1877F2', '#2563eb', '#f97316', '#22c55e', '#a855f7', '#06b6d4',
  '#eab308', '#ec4899', '#14b8a6', '#fb923c', '#8b5cf6', '#4ade80',
  '#ef4444', '#94a3b8', '#64748b',
];

export default function TargetGroupEditor({
  portfolioId,
  initial,
  currency,
}: {
  portfolioId: number;
  initial: EditableGroup[];
  currency: string;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<EditableGroup[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => groups.reduce((a, g) => a + (Number(g.targetPct) || 0), 0),
    [groups]
  );

  function patch(i: number, next: Partial<EditableGroup>) {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...next } : g)));
  }

  function addGroup() {
    const n = groups.filter((g) => !g.isOther).length;
    const next: EditableGroup = {
      key: `group_${Date.now()}`,
      label: 'หมวดใหม่',
      targetPct: 0,
      color: PALETTE[n % PALETTE.length],
      symbols: [],
      isOther: false,
      actualPct: 0,
      marketValue: 0,
      actionAmount: 0,
      heldSymbols: [],
    };
    // แทรกก่อนหมวด "อื่นๆ" เสมอ
    const otherIdx = groups.findIndex((g) => g.isOther);
    setGroups((prev) =>
      otherIdx === -1
        ? [...prev, next]
        : [...prev.slice(0, otherIdx), next, ...prev.slice(otherIdx)]
    );
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    if (groups[i].isOther || groups[j].isOther) return;
    setGroups((prev) => {
      const c = [...prev];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch('/api/target-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          groups: groups.map((g) => ({
            key: g.key,
            label: g.label,
            targetPct: Number(g.targetPct) || 0,
            color: g.color,
            symbols: g.symbols,
            isOther: g.isOther,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setMsg(`บันทึกแล้ว — รวม ${json.total.toFixed(2)}% 🌿`);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const totalTone =
    Math.abs(total - 100) < 0.01
      ? 'text-emerald-700'
      : total > 100
        ? 'text-rose-600'
        : 'text-amber-700';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-forest/60">รวมทั้งหมด</span>
          <span className={`text-xl font-extrabold tabular-nums ${totalTone}`}>
            {total.toFixed(2)}%
          </span>
          {Math.abs(total - 100) >= 0.01 && (
            <span className="text-xs text-forest/50">
              ({total > 100 ? 'เกิน' : 'เหลือ'} {Math.abs(100 - total).toFixed(2)}%)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-soft btn-xs" onClick={addGroup} type="button">
            ＋ เพิ่มหมวด
          </button>
          <button className="btn-primary btn-xs" onClick={save} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : '💾 บันทึกสัดส่วน'}
          </button>
        </div>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-mist">
        {groups.map((g) => (
          <div
            key={g.key}
            style={{
              width: `${Math.min(100, Number(g.targetPct) || 0)}%`,
              background: g.color,
            }}
            title={`${g.label} ${g.targetPct}%`}
          />
        ))}
      </div>

      <div className="space-y-2">
        {groups.map((g, i) => {
          const perSymbol =
            !g.isOther && g.symbols.length > 0
              ? (Number(g.targetPct) || 0) / g.symbols.length
              : null;
          return (
            <div
              key={g.key}
              className="rounded-xl border border-leaf/60 bg-surface/70 p-3"
              style={{ borderLeft: `4px solid ${g.color}` }}
            >
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-12 sm:col-span-3">
                  <input
                    className="input py-1.5 font-semibold"
                    value={g.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                    placeholder="ชื่อหมวด"
                  />
                </div>

                <div className="col-span-5 sm:col-span-3">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={0.25}
                    value={Number(g.targetPct) || 0}
                    onChange={(e) => patch(i, { targetPct: Number(e.target.value) })}
                    className="w-full accent-[#43A047]"
                  />
                </div>

                <div className="col-span-4 sm:col-span-2">
                  <div className="flex items-center gap-1">
                    <input
                      className="input py-1.5 text-right tabular-nums"
                      type="number"
                      min={0}
                      max={100}
                      step={0.25}
                      value={Number(g.targetPct) || 0}
                      onChange={(e) => patch(i, { targetPct: Number(e.target.value) })}
                    />
                    <span className="text-sm text-forest/50">%</span>
                  </div>
                </div>

                <div className="col-span-3 text-right text-xs sm:col-span-3">
                  <div className="text-forest/60">
                    ตอนนี้ <b className="tabular-nums text-forest">{g.actualPct.toFixed(2)}%</b>
                  </div>
                  <div className={toneClass(-(g.actualPct - (Number(g.targetPct) || 0)))}>
                    {Math.abs(g.actionAmount) < 1
                      ? 'ตรงเป้า'
                      : g.actionAmount > 0
                        ? `เติม ${fmtMoney(g.actionAmount, 0)} ${currency}`
                        : `ลด ${fmtMoney(Math.abs(g.actionAmount), 0)} ${currency}`}
                  </div>
                </div>

                <div className="col-span-1 flex justify-end gap-0.5">
                  {!g.isOther && (
                    <>
                      <button
                        className="btn-ghost btn-xs px-1"
                        onClick={() => move(i, -1)}
                        type="button"
                        title="เลื่อนขึ้น"
                        aria-label={`เลื่อนหมวด ${g.label} ขึ้น`}
                      >
                        ↑
                      </button>
                      <button
                        className="btn-ghost btn-xs px-1"
                        onClick={() => setGroups((prev) => prev.filter((_, idx) => idx !== i))}
                        type="button"
                        title="ลบหมวด"
                        aria-label={`ลบหมวด ${g.label}`}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {g.isOther ? (
                  <span className="text-xs text-forest/50">
                    หุ้นที่ไม่อยู่ในหมวดไหน + เงินสด จะถูกนับมารวมที่นี่อัตโนมัติ
                    {g.heldSymbols.length > 0 && <> · ตอนนี้: {g.heldSymbols.join(', ')}</>}
                  </span>
                ) : (
                  <>
                    <input
                      className="input max-w-md py-1.5 text-sm"
                      value={g.symbols.join(', ')}
                      onChange={(e) =>
                        patch(i, {
                          symbols: e.target.value
                            .split(',')
                            .map((x) => x.toUpperCase().trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="หุ้นในหมวด เช่น AMBA, AMBQ, OSS"
                    />
                    {perSymbol !== null && (
                      <span className="text-xs text-forest/50">
                        = ตัวละ <b className="tabular-nums">{perSymbol.toFixed(2)}%</b> (
                        {g.symbols.length} ตัว)
                      </span>
                    )}
                  </>
                )}
                <select
                  className="select ml-auto w-24 py-1 text-xs"
                  value={g.color}
                  onChange={(e) => patch(i, { color: e.target.value })}
                  style={{ color: g.color }}
                >
                  {PALETTE.map((c) => (
                    <option key={c} value={c}>
                      ■ {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}
