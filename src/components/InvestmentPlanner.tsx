'use client';

import { useState } from 'react';
import { Card, Empty } from '@/components/ui';
import { fmtMoney, fmtPct, fmtQty, toneClass } from '@/lib/format';

interface PlanBuy {
  symbol: string; name: string | null;
  groupKey: string; groupLabel: string;
  amount: number; price: number; quantity: number;
  heldQuantity: number; currentAvgCost: number | null; vsAvgCostPct: number | null;
  newAvgCost: number; avgCostChangePct: number | null;
  newQuantity: number; newCostValue: number;
  nearestSupport: number | null; supportDistancePct: number | null;
  weightNow: number; weightTarget: number;
}
interface PlanGroup {
  key: string; label: string; color: string;
  targetPct: number; actualPctNow: number; actualPctAfter: number;
  gap: number; allocated: number;
}
interface Plan {
  currency: string; budget: number; allocated: number; leftover: number;
  buys: PlanBuy[]; groups: PlanGroup[];
  totals: { marketValueNow: number; cash: number; potAfter: number };
  warnings: string[];
  inputBudget: number; inputCurrency: string; fxNote: string | null;
}
interface AiReview { summary: string; watchouts: string[]; notes: string }

export default function InvestmentPlanner({ portfolioId }: { portfolioId: number }) {
  const [budget, setBudget] = useState('10000');
  const [ccy, setCcy] = useState('THB');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ai, setAi] = useState<AiReview | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function calc(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setAi(null); setAiError(null);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          budget: Number(budget),
          budgetCurrency: ccy,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'คำนวณไม่สำเร็จ');
      setPlan(json);
    } catch (e: any) {
      setError(e.message); setPlan(null);
    } finally {
      setBusy(false);
    }
  }

  async function askAi() {
    if (!plan) return;
    setAiBusy(true); setAiError(null);
    try {
      const res = await fetch('/api/plan/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_id: portfolioId, budget: plan.budget }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ขอความเห็นไม่สำเร็จ');
      setAi(json);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  }

  const cur = plan?.currency ?? '';

  return (
    <div className="space-y-4">
      <Card title="เดือนนี้มีเงินเท่าไหร่">
        <form onSubmit={calc} className="flex flex-wrap items-end gap-3">
          <div className="grow sm:grow-0">
            <label className="label" htmlFor="budget">จำนวนเงิน</label>
            <input
              id="budget" type="number" min={1} step="any" required
              className="input sm:w-48"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ccy">สกุลเงิน</label>
            <select id="ccy" className="select w-28" value={ccy} onChange={(e) => setCcy(e.target.value)}>
              <option value="THB">฿ บาท</option>
              <option value="USD">$ USD</option>
            </select>
          </div>
          <button className="btn-primary" disabled={busy || !budget}>
            {busy ? 'กำลังคำนวณ…' : '🧭 วางแผนให้หน่อย'}
          </button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-forest/50">
          คำนวณจาก <b>สัดส่วนเป้าหมายที่คุณตั้งไว้เอง</b> ในหน้ารายละเอียดพอร์ต — เติมเงินเข้าหมวดที่ห่างจากเป้ามากที่สุดก่อน
          ตัวเลขทุกตัวคิดด้วยสูตรตรง ๆ ไม่ได้ให้ AI เดา
        </p>
      </Card>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {plan && (
        <>
          {plan.fxNote && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm text-cyan-700">
              💱 {plan.fxNote}
            </div>
          )}
          {plan.warnings.map((w, i) => (
            <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              ⚠️ {w}
            </div>
          ))}

          {plan.buys.length === 0 ? (
            <Empty emoji="⚖️" title="ยังไม่มีรายการแนะนำ" hint="ทุกหมวดถึงเป้าหมดแล้ว หรือยังไม่ได้ตั้งสัดส่วนเป้าหมาย" />
          ) : (
            <>
              <Card title={`แผนลงเงิน — รวม ${fmtMoney(plan.allocated)} ${cur}`}>
                <div className="table-wrap">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>หุ้น</th>
                        <th>หมวด</th>
                        <th className="num">ลงเท่าไหร่</th>
                        <th className="num">ราคาตอนนี้</th>
                        <th className="num">ได้กี่หุ้น</th>
                        <th className="num">ต้นทุนเดิม</th>
                        <th className="num">ต้นทุนใหม่</th>
                        <th className="num">เฉลี่ยเปลี่ยน</th>
                        <th className="num">ห่างทุน</th>
                        <th className="num">แนวรับใกล้สุด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.buys.map((b) => (
                        <tr key={b.symbol}>
                          <td>
                            <a className="font-bold text-forest hover:underline" href={`/stocks/${encodeURIComponent(b.symbol)}`}>
                              {b.symbol}
                            </a>
                            {b.heldQuantity <= 0 && (
                              <span className="ml-1.5 badge bg-cyan-50 text-cyan-700 border border-cyan-200">ตัวใหม่</span>
                            )}
                          </td>
                          <td className="text-xs text-forest/60">{b.groupLabel}</td>
                          <td className="num font-semibold">{fmtMoney(b.amount)}</td>
                          <td className="num">{fmtMoney(b.price)}</td>
                          <td className="num">{fmtQty(b.quantity)}</td>
                          <td className="num text-forest/60">
                            {b.currentAvgCost !== null ? fmtMoney(b.currentAvgCost) : '—'}
                          </td>
                          <td className="num font-semibold">{fmtMoney(b.newAvgCost)}</td>
                          <td className={`num ${toneClass(b.avgCostChangePct !== null ? -b.avgCostChangePct : null)}`}>
                            {b.avgCostChangePct !== null ? fmtPct(b.avgCostChangePct) : '—'}
                          </td>
                          <td className={`num ${toneClass(b.vsAvgCostPct)}`}>
                            {b.vsAvgCostPct !== null ? fmtPct(b.vsAvgCostPct) : '—'}
                          </td>
                          <td className="num text-xs text-forest/55">
                            {b.nearestSupport !== null
                              ? `${fmtMoney(b.nearestSupport)} (${fmtPct(b.supportDistancePct)})`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-forest/50">
                  <b>เฉลี่ยเปลี่ยน</b> ติดลบ = ซื้อแล้วต้นทุนเฉลี่ยถูกลง (ถัวลง) ·{' '}
                  <b>ห่างทุน</b> ติดลบ = ราคาตอนนี้ต่ำกว่าต้นทุนเดิม
                  {plan.leftover > 0.01 && (
                    <> · เหลือไม่ได้จัดสรร {fmtMoney(plan.leftover)} {cur}</>
                  )}
                </p>
              </Card>

              <Card title="สัดส่วนรายหมวด — ก่อน / หลังลงเงินตามแผน">
                <div className="space-y-2">
                  {plan.groups.map((g) => (
                    <div key={g.key} className="rounded-xl border border-leaf/60 bg-surface/70 p-3"
                         style={{ borderLeft: `4px solid ${g.color}` }}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-forest">{g.label}</span>
                        <span className="text-xs text-forest/60">
                          เป้า <b className="tabular-nums text-forest">{g.targetPct.toFixed(2)}%</b>
                          {' · '}ตอนนี้ <b className="tabular-nums">{g.actualPctNow.toFixed(2)}%</b>
                          {' → '}
                          <b className="tabular-nums text-grass">{g.actualPctAfter.toFixed(2)}%</b>
                          {g.allocated > 0.01 && (
                            <> · เติม <b className="tabular-nums">{fmtMoney(g.allocated)}</b> {cur}</>
                          )}
                        </span>
                      </div>
                      <div className="meter mt-2">
                        <span style={{ width: `${Math.min(100, (g.actualPctAfter / Math.max(g.targetPct, 0.01)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="ให้ AI ช่วยทบทวนแผนนี้">
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn-soft" onClick={askAi} disabled={aiBusy}>
                    {aiBusy ? '🤖 กำลังอ่านแผน…' : '🤖 ขอความเห็นจาก Gemini'}
                  </button>
                  <span className="text-xs text-forest/50">
                    AI เห็นเฉพาะตัวเลขในแผนด้านบน มีหน้าที่สรุป/ทักท้วงเท่านั้น ไม่ได้คิดเลขเองและไม่ได้เลือกหุ้นให้
                  </span>
                </div>

                {aiError && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {aiError}
                  </div>
                )}

                {ai && (
                  <div className="mt-3 space-y-3">
                    {ai.summary && (
                      <p className="text-sm leading-relaxed text-forest/80">{ai.summary}</p>
                    )}
                    {ai.watchouts.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                          ข้อควรระวัง
                        </div>
                        <ul className="list-inside list-disc space-y-1 text-sm text-amber-800">
                          {ai.watchouts.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                    {ai.notes && <p className="text-xs leading-relaxed text-forest/60">{ai.notes}</p>}
                    <p className="text-[11px] leading-relaxed text-forest/40">
                      ความเห็นนี้สร้างโดย AI จากตัวเลขในแผนเท่านั้น ไม่ใช่คำแนะนำการลงทุน โปรดตัดสินใจด้วยตัวเอง
                    </p>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
