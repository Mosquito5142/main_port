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
  isCore: boolean;
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

  const hasCore = groups.some((g) => g.isCore);
  const coreActualTotal = useMemo(
    () => groups.filter((g) => g.isCore).reduce((a, g) => a + (Number(g.actualPct) || 0), 0),
    [groups]
  );
  const satelliteTotal = useMemo(
    () => groups.filter((g) => !g.isCore).reduce((a, g) => a + (Number(g.targetPct) || 0), 0),
    [groups]
  );
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
      isCore: false,
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
            isCore: g.isCore,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setMsg(
        hasCore
          ? `บันทึกแล้ว — แกนหลักลอยตัวตามจริง ดาวบริวารรวม ${json.total.toFixed(2)}% ⭐🌿`
          : `บันทึกแล้ว — รวม ${json.total.toFixed(2)}% 🌿`
      );
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const compareVal = hasCore ? satelliteTotal : total;
  const totalTone =
    Math.abs(compareVal - 100) < 0.01
      ? 'text-emerald-700'
      : compareVal > 100
        ? 'text-rose-600'
        : 'text-amber-700';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          {hasCore ? (
            <>
              <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 border border-blue-200">
                <span className="text-xs font-semibold text-blue-800">⭐ แกนหลัก (Core):</span>
                <span className="text-sm font-bold text-blue-900 tabular-nums">
                  {coreActualTotal.toFixed(2)}%
                </span>
                <span className="text-[11px] text-blue-600/80">(ลอยตัวตามจริง)</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-forest/60">ดาวบริวาร</span>
                <span className={`text-xl font-extrabold tabular-nums ${totalTone}`}>
                  {satelliteTotal.toFixed(2)}%
                </span>
                {Math.abs(satelliteTotal - 100) >= 0.01 && (
                  <span className="text-xs text-forest/50">
                    ({satelliteTotal > 100 ? 'เกิน' : 'เหลือ'}{' '}
                    {Math.abs(100 - satelliteTotal).toFixed(2)}%)
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-sm text-forest/60">รวมทั้งหมด</span>
              <span className={`text-xl font-extrabold tabular-nums ${totalTone}`}>
                {total.toFixed(2)}%
              </span>
              {Math.abs(total - 100) >= 0.01 && (
                <span className="text-xs text-forest/50">
                  ({total > 100 ? 'เกิน' : 'เหลือ'} {Math.abs(100 - total).toFixed(2)}%)
                </span>
              )}
            </>
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
              width: `${Math.min(100, g.isCore ? g.actualPct : Number(g.targetPct) || 0)}%`,
              background: g.color,
            }}
            title={`${g.label} ${g.isCore ? `(Core ลอยตัว ${g.actualPct.toFixed(1)}%)` : `${(Number(g.targetPct) || 0).toFixed(1)}%`}`}
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
              className={`rounded-xl border p-3 ${
                g.isCore
                  ? 'border-blue-300 bg-blue-50/30'
                  : 'border-leaf/60 bg-surface/70'
              }`}
              style={{ borderLeft: `4px solid ${g.color}` }}
            >
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-12 sm:col-span-3 flex items-center gap-1.5">
                  <input
                    className="input py-1.5 font-semibold flex-1 min-w-0"
                    value={g.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                    placeholder="ชื่อหมวด"
                  />
                  {!g.isOther && (
                    <button
                      type="button"
                      onClick={() => patch(i, { isCore: !g.isCore })}
                      className={`btn-xs rounded px-1.5 py-1 text-[11px] font-semibold transition shrink-0 ${
                        g.isCore
                          ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                          : 'bg-mist text-forest/60 hover:bg-mist/80 hover:text-forest'
                      }`}
                      title={
                        g.isCore
                          ? 'คลิกเพื่อเปลี่ยนเป็นหมวดดาวบริวารปกติ'
                          : 'คลิกเพื่อตั้งเป็นแกนหลัก (ไร้เพดานสัดส่วน)'
                      }
                    >
                      {g.isCore ? '⭐ Core' : '☆ Core'}
                    </button>
                  )}
                </div>

                {g.isCore ? (
                  <div className="col-span-9 sm:col-span-5 flex items-center gap-2 rounded-lg bg-blue-50/80 border border-blue-200/70 px-2.5 py-1.5 text-xs text-blue-900">
                    <span className="font-semibold">⭐ แกนหลัก:</span>
                    <span className="text-blue-700">ลอยตัวตามจริง ({g.actualPct.toFixed(2)}%) ไม่จำกัดเพดาน</span>
                  </div>
                ) : (
                  <>
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
                  </>
                )}

                <div className="col-span-2 text-right text-xs sm:col-span-3">
                  <div className="text-forest/60">
                    ตอนนี้ <b className="tabular-nums text-forest">{g.actualPct.toFixed(2)}%</b>
                  </div>
                  {g.isCore ? (
                    <div className="text-blue-700 font-medium">⭐ แกนหลัก</div>
                  ) : (
                    <div className={toneClass(-(g.actualPct - (Number(g.targetPct) || 0)))}>
                      {Math.abs(g.actionAmount) < 1
                        ? 'ตรงเป้า'
                        : g.actionAmount > 0
                          ? `เติม ${fmtMoney(g.actionAmount, 0)} ${currency}`
                          : `ลด ${fmtMoney(Math.abs(g.actionAmount), 0)} ${currency}`}
                    </div>
                  )}
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
                    {g.isCore ? (
                      <span className="text-xs text-blue-700/80">
                        ⭐ หุ้นแกนหลัก {g.symbols.length} ตัว (สะสมเมื่อย่อ)
                      </span>
                    ) : perSymbol !== null ? (
                      <span className="text-xs text-forest/50">
                        = ตัวละ <b className="tabular-nums">{perSymbol.toFixed(2)}%</b> (
                        {g.symbols.length} ตัว)
                      </span>
                    ) : null}
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
