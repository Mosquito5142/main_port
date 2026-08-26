'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtMoney } from '@/lib/format';
import { useIsDark } from '@/lib/useIsDark';

export interface ChartLevel {
  id: number;
  kind: 'support' | 'resistance';
  price: number;
  label?: string | null;
}

const RANGES: { key: string; interval: string; label: string }[] = [
  { key: '5d', interval: '15m', label: '5 วัน' },
  { key: '1mo', interval: '1d', label: '1 เดือน' },
  { key: '3mo', interval: '1d', label: '3 เดือน' },
  { key: '6mo', interval: '1d', label: '6 เดือน' },
  { key: '1y', interval: '1d', label: '1 ปี' },
  { key: '5y', interval: '1wk', label: '5 ปี' },
];

export default function PriceChart({
  symbol,
  levels = [],
  avgCost,
  height = 380,
  defaultRange = '6mo',
}: {
  symbol: string;
  levels?: ChartLevel[];
  avgCost?: number | null;
  height?: number;
  defaultRange?: string;
}) {
  const dark = useIsDark();
  const gridColor = dark ? '#3E5C40' : '#A5D6A7';
  const axisColor = dark ? '#C8E6C9' : '#1B5E20';
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<{ date: string; close: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cfg = RANGES.find((r) => r.key === range) ?? RANGES[3];
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/chart/${encodeURIComponent(symbol)}?range=${cfg.key}&interval=${cfg.interval}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json.error) throw new Error(json.error);
        setData(
          (json.candles ?? [])
            .filter((c: any) => c.close !== null)
            .map((c: any) => ({ date: c.date, close: c.close }))
        );
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol, range]);

  const domain = useMemo<[number, number]>(() => {
    const prices = data.map((d) => d.close);
    const extra = [...levels.map((l) => l.price), ...(avgCost ? [avgCost] : [])];
    const all = [...prices, ...extra].filter((n) => Number.isFinite(n));
    if (!all.length) return [0, 1];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.08 || max * 0.05 || 1;
    return [min - pad, max + pad];
  }, [data, levels, avgCost]);

  const first = data[0]?.close;
  const last = data[data.length - 1]?.close;
  const changePct = first && last ? ((last - first) / first) * 100 : null;
  const up = (changePct ?? 0) >= 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold tabular-nums text-forest">
            {last ? fmtMoney(last) : '—'}
          </span>
          {changePct !== null && (
            <span
              className={`text-sm font-semibold ${up ? 'text-emerald-700' : 'text-rose-600'}`}
            >
              {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}% ในช่วงนี้
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-mist p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={[
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                range === r.key
                  ? 'bg-surface text-forest shadow-sm'
                  : 'text-forest/55 hover:text-forest',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          ดึงกราฟไม่สำเร็จ: {error}
        </div>
      )}

      <div style={{ width: '100%', height }} className={loading ? 'opacity-50' : ''}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#66BB6A" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#E8F5E9" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridColor} strokeOpacity={0.35} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: axisColor, opacity: 0.6 }}
              minTickGap={40}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 11, fill: axisColor, opacity: 0.6 }}
              width={64}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtMoney(Number(v), 2)}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${gridColor}`,
                background: dark ? 'rgba(20,28,22,.96)' : 'rgba(255,255,255,.96)',
                fontSize: 12,
              }}
              labelStyle={{ color: axisColor, fontWeight: 700 }}
              formatter={(v: any) => [fmtMoney(Number(v)), 'ราคาปิด']}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={axisColor}
              strokeWidth={2}
              fill="url(#gp-area)"
              dot={false}
              isAnimationActive={false}
            />

            {avgCost ? (
              <ReferenceLine
                y={avgCost}
                stroke="#7E57C2"
                strokeDasharray="6 4"
                strokeWidth={1.5}
              >
                <Label
                  value={`ต้นทุน ${fmtMoney(avgCost)}`}
                  position="right"
                  fill="#7E57C2"
                  fontSize={10}
                />
              </ReferenceLine>
            ) : null}

            {levels.map((l) => (
              <ReferenceLine
                key={l.id}
                y={l.price}
                stroke={l.kind === 'support' ? '#2E7D32' : '#E53935'}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              >
                <Label
                  value={`${l.kind === 'support' ? 'รับ' : 'ต้าน'} ${fmtMoney(l.price)}`}
                  position="right"
                  fill={l.kind === 'support' ? '#2E7D32' : '#E53935'}
                  fontSize={10}
                />
              </ReferenceLine>
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
