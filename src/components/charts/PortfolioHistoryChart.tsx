'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtMoney, fmtPct, toneClass } from '@/lib/format';
import { useIsDark } from '@/lib/useIsDark';

interface MarkerPoint {
  date: string;
  value: number;
  pct: number;
}

interface History {
  points: { date: string; value: number; pct: number }[];
  capitalBase: number;
  currency: string;
  peak: MarkerPoint | null;
  trough: MarkerPoint | null;
  current: MarkerPoint | null;
  maxDrawdown: number;
  biggestGainDay: { date: string; change: number; pct: number } | null;
  biggestDropDay: { date: string; change: number; pct: number } | null;
  warnings: string[];
}

const RANGES = [
  { key: '1mo', label: '1 เดือน' },
  { key: '3mo', label: '3 เดือน' },
  { key: '6mo', label: '6 เดือน' },
  { key: '1y', label: '1 ปี' },
  { key: '2y', label: '2 ปี' },
  { key: 'max', label: 'ทั้งหมด' },
];

export default function PortfolioHistoryChart({
  portfolioId,
  defaultRange = '1y',
  height = 340,
}: {
  portfolioId: number;
  defaultRange?: string;
  height?: number;
}) {
  const dark = useIsDark();
  const gridColor = dark ? '#3E5C40' : '#A5D6A7';
  const axisColor = dark ? '#C8E6C9' : '#1B5E20';
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'value' | 'pct'>('value');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/portfolios/${portfolioId}/history?range=${range}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [portfolioId, range]);

  const dataKey = mode === 'value' ? 'value' : 'pct';

  const domain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (!data?.points.length) return ['auto', 'auto'];
    const vals = data.points.map((p) => (mode === 'value' ? p.value : p.pct));
    if (mode === 'value' && data.capitalBase > 0) vals.push(data.capitalBase);
    if (mode === 'pct') vals.push(0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [data, mode]);

  const up = (data?.current?.pct ?? 0) >= 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold tabular-nums text-forest">
            {data?.current ? fmtMoney(data.current.value) : '—'}
          </span>
          {data?.current && (
            <span className={`text-sm font-semibold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>
              {up ? '▲' : '▼'} {fmtPct(data.current.pct)} จากเงินตั้งต้น
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-mist p-1">
            {(['value', 'pct'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={[
                  'rounded-lg px-3 py-1 text-xs font-semibold transition',
                  mode === m ? 'bg-surface text-forest shadow-sm' : 'text-forest/55',
                ].join(' ')}
              >
                {m === 'value' ? 'มูลค่า' : '%'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-mist p-1">
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

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          โหลดกราฟไม่สำเร็จ: {error}
        </div>
      )}

      <div style={{ width: '100%', height }} className={loading ? 'opacity-50' : ''}>
        {!data?.points.length ? (
          <div className="flex h-full items-center justify-center text-sm text-forest/40">
            {loading ? 'กำลังคำนวณมูลค่าพอร์ตย้อนหลัง…' : 'ยังไม่มีข้อมูลพอให้วาดกราฟ'}
          </div>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={data.points} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="gp-port-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#66BB6A" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#E8F5E9" stopOpacity={0.05} />
                </linearGradient>
              </defs>
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
                  mode === 'value' ? fmtMoney(Number(v), 0) : `${Number(v).toFixed(1)}%`
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
                formatter={(v: any) => [
                  mode === 'value'
                    ? `${fmtMoney(Number(v))} ${data.currency}`
                    : `${Number(v).toFixed(2)}%`,
                  mode === 'value' ? 'มูลค่าพอร์ต' : 'ผลตอบแทน',
                ]}
              />

              {/* เส้นเงินตั้งต้น — อยู่เหนือเส้นนี้คือกำไร */}
              <ReferenceLine
                y={mode === 'value' ? data.capitalBase : 0}
                stroke="#7E57C2"
                strokeDasharray="6 4"
                strokeWidth={1.5}
              >
                <Label
                  value={mode === 'value' ? 'เงินตั้งต้น' : 'จุดคุ้มทุน'}
                  position="insideBottomLeft"
                  fill="#7E57C2"
                  fontSize={10}
                />
              </ReferenceLine>

              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={axisColor}
                strokeWidth={2.5}
                fill="url(#gp-port-area)"
                dot={false}
                isAnimationActive={false}
              />

              {/* จุดที่พอร์ตเคยไปแตะ */}
              {data.peak && (
                <ReferenceDot
                  x={data.peak.date}
                  y={mode === 'value' ? data.peak.value : data.peak.pct}
                  r={5}
                  fill="#2E7D32"
                  stroke="#fff"
                  strokeWidth={2}
                >
                  <Label
                    value={`สูงสุด ${fmtMoney(data.peak.value, 0)}`}
                    position="top"
                    fill="#2E7D32"
                    fontSize={10}
                    fontWeight={700}
                  />
                </ReferenceDot>
              )}
              {data.trough && (
                <ReferenceDot
                  x={data.trough.date}
                  y={mode === 'value' ? data.trough.value : data.trough.pct}
                  r={5}
                  fill="#E53935"
                  stroke="#fff"
                  strokeWidth={2}
                >
                  <Label
                    value={`ต่ำสุด ${fmtMoney(data.trough.value, 0)}`}
                    position="bottom"
                    fill="#E53935"
                    fontSize={10}
                    fontWeight={700}
                  />
                </ReferenceDot>
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {data && data.points.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Marker
            label="จุดสูงสุด"
            value={fmtMoney(data.peak?.value ?? null, 0)}
            sub={data.peak?.date}
            tone="text-emerald-700"
          />
          <Marker
            label="จุดต่ำสุด"
            value={fmtMoney(data.trough?.value ?? null, 0)}
            sub={data.trough?.date}
            tone="text-rose-600"
          />
          <Marker
            label="ย่อตัวลึกสุด"
            value={fmtPct(data.maxDrawdown)}
            sub="จากจุดสูงสุดที่เคยทำได้"
            tone="text-rose-600"
          />
          <Marker
            label="ห่างจากจุดสูงสุด"
            value={
              data.peak && data.current && data.peak.value > 0
                ? fmtPct(((data.current.value - data.peak.value) / data.peak.value) * 100)
                : '—'
            }
            sub={
              data.peak && data.current && data.current.value >= data.peak.value
                ? 'อยู่ที่จุดสูงสุดพอดี 🎉'
                : 'ต้องขึ้นอีกเท่านี้ถึงจะเท่าเดิม'
            }
            tone={toneClass(
              data.peak && data.current ? data.current.value - data.peak.value : null
            )}
          />
        </div>
      )}

      {data && (data.biggestGainDay || data.biggestDropDay) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.biggestGainDay && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
              📈 วันที่ขึ้นแรงสุด <b>{data.biggestGainDay.date}</b> · +
              {fmtMoney(data.biggestGainDay.change)} {data.currency} (
              {fmtPct(data.biggestGainDay.pct)})
            </div>
          )}
          {data.biggestDropDay && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
              📉 วันที่ลงแรงสุด <b>{data.biggestDropDay.date}</b> ·{' '}
              {fmtMoney(data.biggestDropDay.change)} {data.currency} (
              {fmtPct(data.biggestDropDay.pct)})
            </div>
          )}
        </div>
      )}

      {data?.warnings.map((w, i) => (
        <div
          key={i}
          className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          ⚠️ {w}
        </div>
      ))}
    </div>
  );
}

function Marker({
  label,
  value,
  sub,
  tone = '',
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-leaf/60 bg-surface/70 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-forest/50">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-forest/45">{sub}</div>}
    </div>
  );
}
