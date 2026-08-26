'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtMoney, fmtPct, toneClass } from '@/lib/format';
import { useIsDark } from '@/lib/useIsDark';
import type { Portfolio } from '@/lib/types';

interface Series {
  id: number;
  key: string;
  name: string;
  color: string;
  kind: string;
  capitalBase: number;
  finalValue: number;
  returnPct: number;
  maxDrawdown: number;
  best: boolean;
}

const RANGES = [
  { key: '1mo', label: '1 เดือน' },
  { key: '3mo', label: '3 เดือน' },
  { key: '6mo', label: '6 เดือน' },
  { key: '1y', label: '1 ปี' },
  { key: '2y', label: '2 ปี' },
  { key: '5y', label: '5 ปี' },
];

export default function CompareChart({ portfolios }: { portfolios: Portfolio[] }) {
  const dark = useIsDark();
  const gridColor = dark ? '#3E5C40' : '#A5D6A7';
  const axisColor = dark ? '#C8E6C9' : '#1B5E20';
  const [selected, setSelected] = useState<number[]>(portfolios.map((p) => p.id).slice(0, 4));
  const [range, setRange] = useState('1y');
  const [mode, setMode] = useState<'pct' | 'value'>('pct');
  const [points, setPoints] = useState<any[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected.length) {
      setPoints([]);
      setSeries([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/compare?ids=${selected.join(',')}&range=${range}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json.error) throw new Error(json.error);
        setPoints(json.points ?? []);
        setSeries(json.series ?? []);
        setWarnings(json.warnings ?? []);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selected, range]);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const dataKeySuffix = mode === 'pct' ? '_pct' : '';

  const domain = useMemo<[any, any]>(() => {
    if (!points.length) return ['auto', 'auto'];
    const vals: number[] = [];
    for (const p of points)
      for (const s of series) {
        const v = p[`${s.key}${dataKeySuffix}`];
        if (typeof v === 'number') vals.push(v);
      }
    if (!vals.length) return ['auto', 'auto'];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [points, series, dataKeySuffix]);

  return (
    <div className="space-y-4">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {portfolios.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  aria-pressed={on}
                  className={[
                    'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
                    on
                      ? 'border-transparent text-white shadow-leafy'
                      : 'border-leaf bg-surface/70 text-forest/60 hover:bg-mist',
                  ].join(' ')}
                  style={
                    on
                      ? { backgroundImage: `linear-gradient(135deg, ${p.color} 0%, #1B5E20 100%)` }
                      : undefined
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: on ? '#fff' : p.color }}
                  />
                  {p.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-mist p-1">
              {(['pct', 'value'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={[
                    'rounded-lg px-3 py-1 text-xs font-semibold transition',
                    mode === m ? 'bg-surface text-forest shadow-sm' : 'text-forest/55',
                  ].join(' ')}
                >
                  {m === 'pct' ? '% ผลตอบแทน' : 'มูลค่าเงิน'}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-xl bg-mist p-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={[
                    'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                    range === r.key ? 'bg-surface text-forest shadow-sm' : 'text-forest/55',
                  ].join(' ')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {warnings.map((w, i) => (
        <div
          key={i}
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          ⚠️ {w}
        </div>
      ))}

      <div className="card card-pad">
        <div style={{ width: '100%', height: 420 }} className={loading ? 'opacity-50' : ''}>
          {points.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-forest/40">
              {loading ? 'กำลังคำนวณเส้นทางมูลค่าพอร์ต…' : 'เลือกพอร์ตอย่างน้อย 1 พอร์ตที่มีรายการซื้อขาย'}
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={gridColor} strokeOpacity={0.35} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: axisColor, opacity: 0.6 }}
                  minTickGap={44}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis
                  domain={domain}
                  tick={{ fontSize: 11, fill: axisColor, opacity: 0.6 }}
                  width={72}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    mode === 'pct' ? `${Number(v).toFixed(1)}%` : fmtMoney(Number(v), 0)
                  }
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${gridColor}`,
                    background: dark ? 'rgba(20,28,22,.96)' : 'rgba(255,255,255,.96)',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: axisColor, fontWeight: 700 }}
                  formatter={(v: any, name: any) => [
                    mode === 'pct' ? `${Number(v).toFixed(2)}%` : fmtMoney(Number(v)),
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="plainline"
                />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={`${s.key}${dataKeySuffix}`}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={s.kind === 'main' ? 3 : 2}
                    strokeDasharray={s.kind === 'main' ? undefined : '6 3'}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {series.length > 0 && (
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>พอร์ต</th>
                <th>ประเภท</th>
                <th className="num">เงินตั้งต้น</th>
                <th className="num">มูลค่าปัจจุบัน</th>
                <th className="num">กำไร/ขาดทุน</th>
                <th className="num">ผลตอบแทน</th>
                <th className="num">ย่อตัวสูงสุด</th>
              </tr>
            </thead>
            <tbody>
              {[...series]
                .sort((a, b) => b.returnPct - a.returnPct)
                .map((s) => (
                  <tr key={s.key}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: s.color }}
                        />
                        <span className="font-bold text-forest">{s.name}</span>
                        {s.best && <span className="badge-solid">ดีที่สุด 🏆</span>}
                      </div>
                    </td>
                    <td className="text-xs text-forest/55">
                      {s.kind === 'main' ? 'พอร์ตหลัก' : 'แผนจำลอง'}
                    </td>
                    <td className="num">{fmtMoney(s.capitalBase, 0)}</td>
                    <td className="num font-semibold">{fmtMoney(s.finalValue)}</td>
                    <td className={`num font-semibold ${toneClass(s.finalValue - s.capitalBase)}`}>
                      {fmtMoney(s.finalValue - s.capitalBase)}
                    </td>
                    <td className={`num text-lg font-extrabold ${toneClass(s.returnPct)}`}>
                      {fmtPct(s.returnPct)}
                    </td>
                    <td className="num text-rose-600">{fmtPct(s.maxDrawdown)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
