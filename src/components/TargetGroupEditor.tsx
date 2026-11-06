'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { bandStatus, formatBand, STATUS_LABEL, statusTone } from '@/lib/bands';

export interface EditableMember {
  symbol: string;
  targetPct: number | null;
  targetMin: number | null;
  targetMax: number | null;
  hint: string | null;
}

export interface EditableGroup {
  key: string;
  label: string;
  targetPct: number;
  targetMin: number | null;
  targetMax: number | null;
  hint: string | null;
  color: string;
  symbols: string[];
  members: EditableMember[];
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

/** เพดานอย่างเดียว (min 0) คงเป้ากลางเดิมไว้ ไม่ดันไปกลางช่วง */
function aimOf(min: number | null, max: number | null, prev: number): number {
  if (min == null || max == null || max < min) return prev;
  if (min <= 0) return prev >= 0 && prev <= max ? prev : 0;
  if (prev >= min && prev <= max) return prev;
  return Math.round(((min + max) / 2) * 10) / 10;
}

function reconcile(symbols: string[], members: EditableMember[]): EditableMember[] {
  const by = new Map(members.map((m) => [m.symbol, m]));
  return symbols.map(
    (symbol) =>
      by.get(symbol) ?? {
        symbol,
        targetPct: null,
        targetMin: null,
        targetMax: null,
        hint: null,
      }
  );
}

export default function TargetGroupEditor({
  portfolioId,
  initial,
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

  const tally = useMemo(() => {
    const out = { ok: 0, under: 0, over: 0 };
    for (const g of groups) out[bandStatus(g.actualPct, g.targetMin, g.targetMax)] += 1;
    return out;
  }, [groups]);

  function patch(i: number, next: Partial<EditableGroup>) {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...next } : g)));
  }

  function addGroup() {
    const n = groups.filter((g) => !g.isOther).length;
    const next: EditableGroup = {
      key: `group_${Date.now()}`,
      label: 'หมวดใหม่',
      targetPct: 0,
      targetMin: 0,
      targetMax: 0,
      hint: null,
      color: PALETTE[n % PALETTE.length],
      symbols: [],
      members: [],
      isOther: false,
      isCore: false,
      actualPct: 0,
      marketValue: 0,
      actionAmount: 0,
      heldSymbols: [],
    };
    const otherIdx = groups.findIndex((g) => g.isOther);
    setGroups((prev) =>
      otherIdx === -1 ? [...prev, next] : [...prev.slice(0, otherIdx), next, ...prev.slice(otherIdx)]
    );
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
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
            targetMin: g.targetMin,
            targetMax: g.targetMax,
            hint: g.hint,
            color: g.color,
            symbols: g.symbols,
            members: g.members,
            isOther: g.isOther,
            isCore: g.isCore,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setMsg('บันทึกกรอบเป้าแล้ว');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-forest/55">
          พอดี {tally.ok} · ต่ำเป้า {tally.under} · เกินเป้า {tally.over}
        </p>
        <div className="flex gap-2">
          <button className="btn-soft btn-xs" onClick={addGroup} type="button">
            ＋ หมวด
          </button>
          <button className="btn-primary btn-xs" onClick={save} disabled={busy} type="button">
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((g, i) => {
          const status = bandStatus(g.actualPct, g.targetMin, g.targetMax);
          return (
            <div
              key={g.key}
              className="rounded-xl border border-leaf/60 bg-surface/70 p-3"
              style={{ borderLeft: `4px solid ${g.color}` }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input min-w-[8rem] flex-1 py-1.5 font-semibold"
                  value={g.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  aria-label={`ชื่อหมวด ${g.label}`}
                />
                <label className="flex items-center gap-1 text-xs text-forest/50">
                  <input
                    className="input w-16 py-1.5 text-right tabular-nums"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={g.targetMin ?? ''}
                    aria-label={`เป้าต่ำสุดของ ${g.label}`}
                    onChange={(e) => {
                      const targetMin = e.target.value === '' ? null : Number(e.target.value);
                      patch(i, {
                        targetMin,
                        targetPct: aimOf(targetMin, g.targetMax, g.targetPct),
                      });
                    }}
                  />
                  –
                  <input
                    className="input w-16 py-1.5 text-right tabular-nums"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={g.targetMax ?? ''}
                    aria-label={`เป้าสูงสุดของ ${g.label}`}
                    onChange={(e) => {
                      const targetMax = e.target.value === '' ? null : Number(e.target.value);
                      patch(i, {
                        targetMax,
                        targetPct: aimOf(g.targetMin, targetMax, g.targetPct),
                      });
                    }}
                  />
                  %
                </label>
                <span className="text-xs tabular-nums text-forest/60">
                  ตอนนี้ <b className="text-forest">{g.actualPct.toFixed(1)}%</b>
                </span>
                <span className={`badge border ${statusTone(status)}`}>{STATUS_LABEL[status]}</span>
                <span className="ml-auto flex gap-0.5">
                  <button
                    className="btn-ghost btn-xs px-1"
                    onClick={() => move(i, -1)}
                    type="button"
                    aria-label={`เลื่อนหมวด ${g.label} ขึ้น`}
                  >
                    ↑
                  </button>
                  {g.isOther ? null : (
                    <button
                      className="btn-ghost btn-xs px-1"
                      onClick={() => setGroups((prev) => prev.filter((_, idx) => idx !== i))}
                      type="button"
                      aria-label={`ลบหมวด ${g.label}`}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>

              {g.isOther ? (
                <p className="mt-2 text-[11px] text-forest/45">
                  เงินสดและหุ้นที่ไม่อยู่ในหมวดจะมารวมที่นี่
                  {g.heldSymbols.length > 0 ? ` · นอกแผน: ${g.heldSymbols.join(', ')}` : ''}
                </p>
              ) : (
                <>
                  <input
                    className="input mt-2 w-full py-1.5 text-sm"
                    value={g.symbols.join(', ')}
                    aria-label={`หุ้นในหมวด ${g.label}`}
                    onChange={(e) => {
                      const symbols = e.target.value
                        .split(',')
                        .map((x) => x.toUpperCase().trim())
                        .filter(Boolean);
                      patch(i, { symbols, members: reconcile(symbols, g.members) });
                    }}
                    placeholder="หุ้นในหมวด เช่น AXON, AMBA"
                  />
                  {g.members.some((m) => m.targetMin != null || m.targetMax != null) ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-forest/45">
                      {g.members
                        .map(
                          (m) =>
                            `${m.symbol} ${formatBand(m.targetMin, m.targetMax, m.targetPct ?? 0)}`
                        )
                        .join(' · ')}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>

      {msg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
