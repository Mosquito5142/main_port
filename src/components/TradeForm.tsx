'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { simulateAverage } from '@/lib/calc';
import { fmtMoney, fmtPct, fmtQty, toneClass } from '@/lib/format';

export interface PositionLite {
  stock_id: number;
  symbol: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  price: number | null;
}

export interface PortfolioLite {
  id: number;
  name: string;
  kind: string;
  currency: string;
  cash: number;
  marketValue: number;
  positions: PositionLite[];
}

export default function TradeForm({
  portfolios,
  stocks,
  defaultPortfolioId,
  defaultSymbol,
}: {
  portfolios: PortfolioLite[];
  stocks: { id: number; symbol: string; name: string | null }[];
  defaultPortfolioId?: number;
  defaultSymbol?: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [portfolioId, setPortfolioId] = useState<number>(
    defaultPortfolioId ?? portfolios[0]?.id ?? 0
  );
  const [symbol, setSymbol] = useState(defaultSymbol ?? stocks[0]?.symbol ?? '');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('0');
  const [tradedAt, setTradedAt] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const portfolio = portfolios.find((p) => p.id === portfolioId);
  const position = portfolio?.positions.find((x) => x.symbol === symbol);

  // เติมราคาตลาดให้อัตโนมัติเมื่อเปลี่ยนหุ้น
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((rows) => {
        if (!alive) return;
        const p = rows?.[0]?.price;
        if (p) setPrice((cur) => (cur === '' ? String(p) : cur));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [symbol]);

  const sim = useMemo(() => {
    const q = Number(quantity) || 0;
    const p = Number(price) || 0;
    const f = Number(fee) || 0;
    const curQty = position?.quantity ?? 0;
    const curAvg = position?.avgCost ?? 0;
    const mkt = position?.price ?? (p || 0);
    const othersValue = (portfolio?.marketValue ?? 0) - (position?.marketValue ?? 0);

    if (side === 'buy') {
      return {
        kind: 'buy' as const,
        ...simulateAverage({
          currentQty: curQty,
          currentAvg: curAvg,
          addQty: q,
          addPrice: p,
          fee: f,
          portfolioValueExcl: othersValue,
          marketPrice: mkt,
        }),
        cashAfter: (portfolio?.cash ?? 0) - (q * p + f),
      };
    }

    const sellQty = Math.min(q, curQty);
    const proceeds = q * p - f;
    const costOut = curAvg * sellQty;
    const remainQty = Math.max(0, curQty - q);
    const remainValue = remainQty * mkt;
    return {
      kind: 'sell' as const,
      realized: proceeds - costOut,
      realizedPct: costOut > 0 ? ((proceeds - costOut) / costOut) * 100 : 0,
      proceeds,
      remainQty,
      newAvg: curAvg, // ขายแบบถัวเฉลี่ยไม่เปลี่ยนต้นทุนต่อหุ้น
      weightAfter:
        othersValue + remainValue > 0 ? (remainValue / (othersValue + remainValue)) * 100 : 0,
      weightBefore:
        othersValue + curQty * mkt > 0 ? ((curQty * mkt) / (othersValue + curQty * mkt)) * 100 : 0,
      cashAfter: (portfolio?.cash ?? 0) + proceeds,
    };
  }, [quantity, price, fee, side, position, portfolio]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          symbol,
          side,
          quantity: Number(quantity),
          price: Number(price),
          fee: Number(fee) || 0,
          traded_at: tradedAt,
          note: note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setOkMsg(`บันทึก${side === 'buy' ? 'ซื้อ' : 'ขาย'} ${symbol} ${quantity} หุ้น เรียบร้อย 🌿`);
      setQuantity('');
      setNote('');
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const totalCost = (Number(quantity) || 0) * (Number(price) || 0) + (Number(fee) || 0);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <form onSubmit={submit} className="card card-pad space-y-3 lg:col-span-3">
        <h3 className="card-title">บันทึกรายการซื้อขาย</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">พอร์ต</label>
            <select
              className="select"
              value={portfolioId}
              onChange={(e) => setPortfolioId(Number(e.target.value))}
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.kind === 'main' ? '(หลัก)' : '(แผน)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">หุ้น</label>
            <input
              className="input"
              list="stock-options"
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value.toUpperCase());
                setPrice('');
              }}
              placeholder="PTT.BK"
              required
            />
            <datalist id="stock-options">
              {stocks.map((s) => (
                <option key={s.id} value={s.symbol}>
                  {s.name ?? ''}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className="label">ประเภท</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide('buy')}
                className={
                  side === 'buy'
                    ? 'btn-primary'
                    : 'btn-soft'
                }
              >
                ซื้อ
              </button>
              <button
                type="button"
                onClick={() => setSide('sell')}
                className={
                  side === 'sell'
                    ? 'btn border border-amber-300 bg-amber-100 text-amber-900'
                    : 'btn-soft'
                }
              >
                ขาย
              </button>
            </div>
          </div>

          <div>
            <label className="label">วันที่</label>
            <input
              className="input"
              type="date"
              value={tradedAt}
              onChange={(e) => setTradedAt(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <label className="label mb-0">จำนวนหุ้น</label>
              {position && position.quantity > 0 && (
                <button
                  type="button"
                  // ใส่จำนวนที่ถืออยู่ "เต็มความละเอียด" ไม่ปัดเศษ
                  // ถ้าพิมพ์เองแล้วปัด จะเหลือเศษหุ้นค้างในพอร์ต (เคยเกิดกับ INFQ)
                  onClick={() => {
                    setSide('sell');
                    setQuantity(String(position.quantity));
                  }}
                  className="text-[11px] font-semibold text-grass underline-offset-2 hover:underline"
                  title={`ขายทั้งหมดที่ถืออยู่ ${fmtQty(position.quantity)} หุ้น`}
                >
                  ปิดโพสิชั่น ({fmtQty(position.quantity)})
                </button>
              )}
            </div>
            <input
              className="input tabular-nums"
              type="number"
              step="0.000001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="100"
              required
            />
            {side === 'sell' && position && position.quantity > 0 && (() => {
              const q = Number(quantity) || 0;
              const left = position.quantity - q;
              // เตือนเฉพาะตอนที่เหลือเศษน้อยมากจนน่าจะพิมพ์ปัดเลขมา
              if (q > 0 && left > 0 && left < position.quantity * 0.001) {
                return (
                  <p className="mt-1 text-[11px] text-amber-700">
                    จะเหลือเศษค้างไว้ {fmtQty(left)} หุ้น — กด &ldquo;ปิดโพสิชั่น&rdquo; ถ้าตั้งใจขายทั้งหมด
                  </p>
                );
              }
              return null;
            })()}
          </div>

          <div>
            <label className="label">ราคาต่อหุ้น</label>
            <input
              className="input tabular-nums"
              type="number"
              step="0.0001"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="label">ค่าธรรมเนียม</label>
            <input
              className="input tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>

          <div>
            <label className="label">โน้ต</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ซื้อตามแผนที่แนวรับ"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-mist/70 px-3 py-2 text-sm">
          <span className="text-forest/60">มูลค่ารายการนี้</span>
          <span className="text-lg font-extrabold tabular-nums text-forest">
            {fmtMoney(totalCost)} {portfolio?.currency}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        {okMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {okMsg}
          </div>
        )}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : `💾 บันทึกการ${side === 'buy' ? 'ซื้อ' : 'ขาย'}`}
        </button>
      </form>

      {/* ---- ผลลัพธ์การคำนวณ ---- */}
      <div className="card card-pad lg:col-span-2">
        <h3 className="card-title mb-3">ถ้าทำรายการนี้จะเป็นยังไง</h3>

        <div className="mb-3 rounded-xl bg-mist/70 px-3 py-2 text-xs text-forest/70">
          ตอนนี้ถือ <b className="tabular-nums">{fmtQty(position?.quantity ?? 0)}</b> หุ้น · ต้นทุนเฉลี่ย{' '}
          <b className="tabular-nums">{fmtMoney(position?.avgCost ?? 0)}</b> · ราคาตลาด{' '}
          <b className="tabular-nums">{fmtMoney(position?.price ?? null)}</b>
        </div>

        {sim.kind === 'buy' ? (
          <dl className="space-y-2 text-sm">
            <Row label="ต้นทุนเฉลี่ยใหม่" value={fmtMoney(sim.newAvg)} strong />
            <Row
              label="ต้นทุนเฉลี่ยเปลี่ยน"
              value={
                <span className={toneClass(-sim.avgChange)}>
                  {sim.avgChange >= 0 ? '+' : ''}
                  {fmtMoney(sim.avgChange)} ({fmtPct(sim.avgChangePct)})
                </span>
              }
            />
            <Row label="จำนวนหุ้นรวม" value={fmtQty(sim.newQty)} />
            <Row label="ต้นทุนรวม" value={fmtMoney(sim.newCost)} />
            <Row
              label="กำไร/ขาดทุนทันที"
              value={
                <span className={toneClass(sim.unrealized)}>
                  {fmtMoney(sim.unrealized)} ({fmtPct(sim.unrealizedPct)})
                </span>
              }
            />
            <hr className="border-leaf/50" />
            <Row
              label="สัดส่วนในพอร์ต"
              value={
                <span>
                  {sim.weightBefore.toFixed(2)}% →{' '}
                  <b className="text-forest">{sim.weightAfter.toFixed(2)}%</b>
                </span>
              }
            />
            <Row label="เงินสดคงเหลือ" value={fmtMoney(sim.cashAfter)} />
          </dl>
        ) : (
          <dl className="space-y-2 text-sm">
            <Row
              label="กำไร/ขาดทุนที่รับรู้"
              value={
                <span className={toneClass(sim.realized)}>
                  {fmtMoney(sim.realized)} ({fmtPct(sim.realizedPct)})
                </span>
              }
              strong
            />
            <Row label="เงินที่ได้รับ" value={fmtMoney(sim.proceeds)} />
            <Row label="หุ้นคงเหลือ" value={fmtQty(sim.remainQty)} />
            <Row label="ต้นทุนเฉลี่ยคงเดิม" value={fmtMoney(sim.newAvg)} />
            <hr className="border-leaf/50" />
            <Row
              label="สัดส่วนในพอร์ต"
              value={
                <span>
                  {sim.weightBefore.toFixed(2)}% →{' '}
                  <b className="text-forest">{sim.weightAfter.toFixed(2)}%</b>
                </span>
              }
            />
            <Row label="เงินสดคงเหลือ" value={fmtMoney(sim.cashAfter)} />
          </dl>
        )}

        <div className="mt-4 rounded-xl border border-leaf/60 bg-surface/60 p-3 text-[11px] leading-relaxed text-forest/55">
          คำนวณด้วยวิธี <b>ต้นทุนถัวเฉลี่ย (average cost)</b> — ค่าธรรมเนียมฝั่งซื้อถูกรวมเข้าต้นทุน
          ส่วนฝั่งขายถูกหักออกจากเงินที่ได้รับ
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-forest/55">{label}</dt>
      <dd
        className={[
          'tabular-nums',
          strong ? 'text-lg font-extrabold text-forest' : 'font-semibold text-forest/85',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
