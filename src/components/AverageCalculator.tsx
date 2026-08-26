'use client';

import { useEffect, useMemo, useState } from 'react';
import { qtyToReachAverage, simulateAverage } from '@/lib/calc';
import { fmtMoney, fmtPct, fmtQty, toneClass } from '@/lib/format';
import type { PortfolioLite } from './TradeForm';

export default function AverageCalculator({
  portfolios,
  defaultSymbol,
}: {
  portfolios: PortfolioLite[];
  defaultSymbol?: string;
}) {
  const [portfolioId, setPortfolioId] = useState<number>(portfolios[0]?.id ?? 0);
  const [symbol, setSymbol] = useState(defaultSymbol ?? '');
  const [manual, setManual] = useState(false);
  const [curQty, setCurQty] = useState('0');
  const [curAvg, setCurAvg] = useState('0');
  const [addQty, setAddQty] = useState('100');
  const [addPrice, setAddPrice] = useState('');
  const [fee, setFee] = useState('0');
  const [targetAvg, setTargetAvg] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | null>(null);

  // โหมด "จำนวนเงิน" — พิมพ์ว่าจะใช้เงินเท่าไหร่ (บาทหรือสกุลของหุ้นเอง) แล้วระบบคำนวณจำนวนหุ้นให้
  const [inputMode, setInputMode] = useState<'qty' | 'amount'>('qty');
  const [addAmount, setAddAmount] = useState('10000');
  const [amountCcy, setAmountCcy] = useState<'native' | 'THB'>('native');
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  const portfolio = portfolios.find((p) => p.id === portfolioId);
  const position = portfolio?.positions.find((p) => p.symbol === symbol.toUpperCase());

  // sync ข้อมูลจากพอร์ตเมื่อเลือกหุ้น
  useEffect(() => {
    if (manual) return;
    setCurQty(String(position?.quantity ?? 0));
    setCurAvg(String(position?.avgCost ? Number(position.avgCost.toFixed(4)) : 0));
  }, [position, manual]);

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    fetch(`/api/quotes?symbols=${encodeURIComponent(symbol.toUpperCase())}`)
      .then((r) => r.json())
      .then((rows) => {
        if (!alive) return;
        const p = rows?.[0]?.price ?? null;
        setMarketPrice(p);
        if (p) setAddPrice((cur) => (cur === '' ? String(p) : cur));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [symbol]);

  const nativeCcy = (portfolio?.currency ?? 'USD').toUpperCase();

  // ดึงเรตแลกเปลี่ยนตอนเลือกกรอกเป็นเงินบาท (ราคาหุ้น "ที่ราคา" ยังคงเป็นสกุลของหุ้นเสมอ
  // เปลี่ยนได้แค่ "จำนวนเงิน" ที่จะใช้ซื้อ — งบเป็นบาทได้แม้หุ้นจะเทรดเป็นดอลลาร์)
  useEffect(() => {
    if (amountCcy === 'native' || nativeCcy === 'THB') {
      setFxRate(1);
      return;
    }
    let alive = true;
    setFxLoading(true);
    fetch(`/api/fx?from=${nativeCcy}&to=THB`)
      .then((r) => r.json())
      .then((json) => alive && setFxRate(json.rate ?? null))
      .catch(() => alive && setFxRate(null))
      .finally(() => alive && setFxLoading(false));
    return () => {
      alive = false;
    };
  }, [amountCcy, nativeCcy]);

  // จำนวนเงินที่กรอก (ไม่ว่าจะเป็นบาทหรือสกุลของหุ้น) แปลงกลับเป็นสกุลของหุ้นเพื่อคำนวณ
  const amountInNative =
    amountCcy === 'native'
      ? Number(addAmount) || 0
      : fxRate
        ? (Number(addAmount) || 0) / fxRate
        : 0;
  const qtyFromAmount = Number(addPrice) > 0 ? amountInNative / Number(addPrice) : 0;

  // โหมด "จำนวนเงิน" -> คำนวณจำนวนหุ้นแล้วป้อนเข้า addQty ตัวเดียวกับที่ใช้คำนวณทั้งหน้า
  useEffect(() => {
    if (inputMode === 'amount') setAddQty(String(qtyFromAmount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, qtyFromAmount]);

  const othersValue = (portfolio?.marketValue ?? 0) - (position?.marketValue ?? 0);
  const mkt = marketPrice ?? (Number(addPrice) || 0);

  const sim = useMemo(
    () =>
      simulateAverage({
        currentQty: Number(curQty) || 0,
        currentAvg: Number(curAvg) || 0,
        addQty: Number(addQty) || 0,
        addPrice: Number(addPrice) || 0,
        fee: Number(fee) || 0,
        portfolioValueExcl: othersValue,
        marketPrice: mkt,
      }),
    [curQty, curAvg, addQty, addPrice, fee, othersValue, mkt]
  );

  const needQty = useMemo(() => {
    const t = Number(targetAvg);
    if (!t) return null;
    return qtyToReachAverage(Number(curQty) || 0, Number(curAvg) || 0, Number(addPrice) || 0, t);
  }, [targetAvg, curQty, curAvg, addPrice]);

  // ตารางสถานการณ์: ลองซื้อเพิ่มหลายขนาด — โหมดจำนวนหุ้นคูณจำนวนหุ้น, โหมดจำนวนเงินคูณเงินที่จะใช้
  const scenarios = useMemo(() => {
    const price = Number(addPrice) || 0;
    const baseAmount = Number(addAmount) || 0;

    return [0.5, 1, 1.5, 2, 3].map((m) => {
      let q: number;
      let amountLabel: number | null = null;
      if (inputMode === 'amount') {
        const amt = Math.round(baseAmount * m * 100) / 100;
        const nativeAmt = amountCcy === 'native' ? amt : fxRate ? amt / fxRate : 0;
        q = price > 0 ? nativeAmt / price : 0;
        amountLabel = amt;
      } else {
        q = Math.round((Number(addQty) || 100) * m * 100) / 100;
      }
      const s = simulateAverage({
        currentQty: Number(curQty) || 0,
        currentAvg: Number(curAvg) || 0,
        addQty: q,
        addPrice: price,
        fee: Number(fee) || 0,
        portfolioValueExcl: othersValue,
        marketPrice: mkt,
      });
      return { qty: q, amountLabel, ...s };
    });
  }, [
    addQty,
    addAmount,
    addPrice,
    curQty,
    curAvg,
    fee,
    othersValue,
    mkt,
    inputMode,
    amountCcy,
    fxRate,
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card card-pad space-y-3 lg:col-span-2">
          <h3 className="card-title">ข้อมูลตั้งต้น</h3>

          <div>
            <label className="label">พอร์ต</label>
            <select
              className="select"
              value={portfolioId}
              onChange={(e) => setPortfolioId(Number(e.target.value))}
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">หุ้น</label>
            <select
              className="select"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              <option value="">— เลือกหุ้น —</option>
              {portfolio?.positions.map((p) => (
                <option key={p.stock_id} value={p.symbol}>
                  {p.symbol} · ถือ {fmtQty(p.quantity)} @ {fmtMoney(p.avgCost)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-forest/70">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
              className="h-4 w-4 accent-[#43A047]"
            />
            กรอกจำนวน/ต้นทุนเอง (ไม่ดึงจากพอร์ต)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ถืออยู่ (หุ้น)</label>
              <input
                className="input tabular-nums"
                type="number"
                step="0.000001"
                value={curQty}
                onChange={(e) => setCurQty(e.target.value)}
                disabled={!manual && !!position}
              />
            </div>
            <div>
              <label className="label">ต้นทุนเฉลี่ยเดิม</label>
              <input
                className="input tabular-nums"
                type="number"
                step="0.0001"
                value={curAvg}
                onChange={(e) => setCurAvg(e.target.value)}
                disabled={!manual && !!position}
              />
            </div>
          </div>

          <hr className="border-leaf/50" />

          <div>
            <label className="label">จะระบุเป็น</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInputMode('qty')}
                className={inputMode === 'qty' ? 'btn-primary btn-xs' : 'btn-soft btn-xs'}
              >
                จำนวนหุ้น
              </button>
              <button
                type="button"
                onClick={() => setInputMode('amount')}
                className={inputMode === 'amount' ? 'btn-primary btn-xs' : 'btn-soft btn-xs'}
              >
                จำนวนเงิน
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {inputMode === 'qty' ? (
              <div>
                <label className="label">จะซื้อเพิ่ม (หุ้น)</label>
                <input
                  className="input tabular-nums"
                  type="number"
                  step="0.000001"
                  min="0"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                />
              </div>
            ) : (
              <div className="col-span-2">
                <label className="label">จะใช้เงินซื้อ</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 tabular-nums"
                    type="number"
                    step="1"
                    min="0"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="เช่น 10000"
                  />
                  <select
                    className="select w-28"
                    value={amountCcy}
                    onChange={(e) => setAmountCcy(e.target.value as 'native' | 'THB')}
                  >
                    <option value="native">{nativeCcy}</option>
                    {nativeCcy !== 'THB' && <option value="THB">บาท (THB)</option>}
                  </select>
                </div>
                <div className="mt-1.5 text-xs text-forest/60">
                  {fxLoading ? (
                    'กำลังดึงอัตราแลกเปลี่ยน…'
                  ) : Number(addPrice) > 0 ? (
                    <>
                      = <b className="tabular-nums text-forest">{fmtQty(qtyFromAmount)}</b> หุ้น
                      {amountCcy === 'THB' && fxRate && (
                        <span className="text-forest/40">
                          {' '}
                          (1 {nativeCcy} = {fxRate.toFixed(2)} บาท)
                        </span>
                      )}
                    </>
                  ) : (
                    'ใส่ราคาก่อนถึงจะคำนวณจำนวนหุ้นได้'
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="label">ที่ราคา ({nativeCcy})</label>
              <input
                className="input tabular-nums"
                type="number"
                step="0.0001"
                min="0"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
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
              <label className="label">อยากได้ต้นทุนเฉลี่ย</label>
              <input
                className="input tabular-nums"
                type="number"
                step="0.0001"
                min="0"
                value={targetAvg}
                onChange={(e) => setTargetAvg(e.target.value)}
                placeholder="เช่น 32.50"
              />
            </div>
          </div>

          {marketPrice !== null && (
            <div className="rounded-xl bg-mist/70 px-3 py-2 text-xs text-forest/65">
              ราคาตลาดล่าสุดของ {symbol}: <b className="tabular-nums">{fmtMoney(marketPrice)}</b>
            </div>
          )}
        </div>

        <div className="card card-pad lg:col-span-3">
          <h3 className="card-title mb-4">ผลลัพธ์</h3>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Box label="ต้นทุนเฉลี่ยใหม่" value={fmtMoney(sim.newAvg)} highlight />
            <Box
              label="เปลี่ยนจากเดิม"
              value={
                <span className={toneClass(-sim.avgChange)}>
                  {sim.avgChange >= 0 ? '+' : ''}
                  {fmtMoney(sim.avgChange)}
                </span>
              }
              sub={fmtPct(sim.avgChangePct)}
            />
            <Box label="หุ้นรวม" value={fmtQty(sim.newQty)} sub={`ต้นทุนรวม ${fmtMoney(sim.newCost)}`} />
            <Box
              label="เงินที่ต้องใช้"
              value={fmtMoney(sim.addCost)}
              sub={`เงินสด ${fmtMoney((portfolio?.cash ?? 0) - sim.addCost, 0)} หลังซื้อ`}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-leaf/60 bg-surface/70 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-forest/55">
                สัดส่วนในพอร์ต
              </div>
              <div className="flex items-baseline gap-2 text-2xl font-extrabold tabular-nums text-forest">
                {sim.weightBefore.toFixed(2)}%
                <span className="text-forest/30">→</span>
                <span className="text-grass">{sim.weightAfter.toFixed(2)}%</span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-mist">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, sim.weightAfter)}%`,
                    backgroundImage: 'linear-gradient(90deg,#A5D6A7,#1B5E20)',
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-forest/50">
                คิดจากมูลค่าหุ้นอื่นในพอร์ต {fmtMoney(othersValue, 0)}
              </div>
            </div>

            <div className="rounded-xl border border-leaf/60 bg-surface/70 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-forest/55">
                กำไร/ขาดทุน ณ ราคาตลาด
              </div>
              <div className={`text-2xl font-extrabold tabular-nums ${toneClass(sim.unrealized)}`}>
                {fmtMoney(sim.unrealized)}
              </div>
              <div className={`text-sm font-semibold ${toneClass(sim.unrealizedPct)}`}>
                {fmtPct(sim.unrealizedPct)}
              </div>
              <div className="mt-2 text-xs text-forest/50">
                จุดคุ้มทุนใหม่ <b className="tabular-nums text-forest">{fmtMoney(sim.breakEven)}</b>
              </div>
            </div>
          </div>

          {targetAvg && (
            <div className="mt-4 rounded-xl border border-leaf/60 bg-mist/60 p-4 text-sm">
              {needQty === null ? (
                <span className="text-rose-700">
                  ไม่สามารถถัวไปถึง {fmtMoney(Number(targetAvg))} ที่ราคา {fmtMoney(Number(addPrice))} ได้
                  {Number(addPrice) >= Number(targetAvg) &&
                    ' — ราคาที่จะซื้อต้องต่ำกว่าต้นทุนเป้าหมาย'}
                </span>
              ) : (
                <span className="text-forest">
                  ต้องซื้อเพิ่มอีกประมาณ{' '}
                  <b className="text-lg tabular-nums">{fmtQty(Math.ceil(needQty))}</b> หุ้น ที่ราคา{' '}
                  {fmtMoney(Number(addPrice))} → ใช้เงิน{' '}
                  <b className="tabular-nums">
                    {fmtMoney(Math.ceil(needQty) * Number(addPrice))}
                  </b>{' '}
                  เพื่อให้ต้นทุนเฉลี่ยเหลือ {fmtMoney(Number(targetAvg))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>{inputMode === 'amount' ? 'ถ้าใช้เงิน' : 'ถ้าซื้อเพิ่ม'}</th>
              <th className="num">ใช้เงินจริง ({nativeCcy})</th>
              <th className="num">ต้นทุนเฉลี่ยใหม่</th>
              <th className="num">เปลี่ยนแปลง</th>
              <th className="num">หุ้นรวม</th>
              <th className="num">สัดส่วนใหม่</th>
              <th className="num">กำไร/ขาดทุน</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr key={i}>
                <td className="font-semibold">
                  {s.amountLabel !== null ? (
                    <>
                      {fmtMoney(s.amountLabel, 0)} {amountCcy === 'native' ? nativeCcy : 'บาท'}
                      <span className="ml-1 font-normal text-forest/45">
                        (≈ {fmtQty(s.qty)} หุ้น)
                      </span>
                    </>
                  ) : (
                    `${fmtQty(s.qty)} หุ้น`
                  )}
                </td>
                <td className="num">{fmtMoney(s.addCost)}</td>
                <td className="num font-bold text-forest">{fmtMoney(s.newAvg)}</td>
                <td className={`num ${toneClass(-s.avgChange)}`}>
                  {s.avgChange >= 0 ? '+' : ''}
                  {fmtMoney(s.avgChange)} ({fmtPct(s.avgChangePct)})
                </td>
                <td className="num">{fmtQty(s.newQty)}</td>
                <td className="num">{s.weightAfter.toFixed(2)}%</td>
                <td className={`num ${toneClass(s.unrealized)}`}>
                  {fmtMoney(s.unrealized)} ({fmtPct(s.unrealizedPct)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Box({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-xl border p-3',
        highlight ? 'border-transparent text-white' : 'border-leaf/60 bg-surface/70',
      ].join(' ')}
      style={
        highlight
          ? { backgroundImage: 'linear-gradient(135deg,#66BB6A 0%,#1B5E20 100%)' }
          : undefined
      }
    >
      <div
        className={[
          'text-[10px] font-bold uppercase tracking-wider',
          highlight ? 'text-white/70' : 'text-forest/50',
        ].join(' ')}
      >
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums">{value}</div>
      {sub && (
        <div className={['mt-0.5 text-xs', highlight ? 'text-white/75' : 'text-forest/50'].join(' ')}>
          {sub}
        </div>
      )}
    </div>
  );
}
