import Link from 'next/link';
import { notFound } from 'next/navigation';
import { applyFx, getPortfolioView, listTrades } from '@/lib/portfolio';
import { fmtMoney, fmtPct, toneClass } from '@/lib/format';
import { Card, Empty, PageHeader, Stat } from '@/components/ui';
import PositionsTable from '@/components/PositionsTable';
import TradesTable from '@/components/TradesTable';
import ClosedPositions from '@/components/ClosedPositions';
import TargetGroupEditor, { type EditableGroup } from '@/components/TargetGroupEditor';
import GroupAllocationList from '@/components/GroupAllocationList';
import PortfolioActions from '@/components/PortfolioActions';
import { getFx } from '@/lib/currency';
import AllocationChart from '@/components/charts/AllocationChart';
import PortfolioHistoryChart from '@/components/charts/PortfolioHistoryChart';

export const dynamic = 'force-dynamic';

export default async function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // ไม่ขึ้นต่อกัน — ยิงขนานกันแทนที่จะรอต่อคิว
  const [raw, trades] = await Promise.all([
    getPortfolioView(Number(id)),
    listTrades(Number(id)),
  ]);
  if (!raw) notFound();

  const fx = await getFx(raw.portfolio.currency);
  const view = applyFx(raw, fx);
  const { portfolio: p, positions, closed, totals: t } = view;

  const cashGroup = view.groups.find((g) => g.isOther);
  const groupRows: EditableGroup[] = view.groups.map((g) => ({
    key: g.key,
    label: g.label,
    targetPct: g.baseTargetPct ?? g.targetPct,
    targetMin: g.targetMin,
    targetMax: g.targetMax,
    hint: g.hint,
    color: g.color,
    symbols: g.symbols,
    members: g.members.map((m) => ({
      symbol: m.symbol,
      targetPct: m.targetPct,
      targetMin: m.targetMin,
      targetMax: m.targetMax,
      hint: m.hint,
    })),
    isOther: g.isOther,
    isCore: g.isCore,
    actualPct: g.actualPct,
    marketValue: g.marketValue,
    actionAmount: g.actionAmount,
    heldSymbols: g.heldSymbols,
  }));

  return (
    <>
      <PageHeader
        title={p.name}
        emoji={p.kind === 'main' ? '🌳' : '🌾'}
        subtitle={[
          p.description ?? (p.kind === 'main' ? 'พอร์ตหลัก' : 'พอร์ตจำลองสำหรับเทียบแผน'),
          fx.note,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex gap-2">
            <Link href="/portfolios" className="btn-soft">
              ← ทุกพอร์ต
            </Link>
            <Link href={`/trades?portfolio=${p.id}`} className="btn-primary">
              ＋ บันทึกซื้อขาย
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat
          accent
          label="มูลค่ารวม"
          value={fmtMoney(t.netWorth)}
          sub={`${p.currency} · ${fmtPct(t.totalReturnPct)} จากเงินตั้งต้น`}
        />
        <Stat label="มูลค่าหุ้น" value={fmtMoney(t.marketValue)} sub={`ต้นทุน ${fmtMoney(t.costValue)}`} />
        <Stat
          label="กำไรที่ยังไม่ขาย"
          value={<span className={toneClass(t.unrealizedPnl)}>{fmtMoney(t.unrealizedPnl)}</span>}
          sub={fmtPct(t.unrealizedPct)}
          tone={t.unrealizedPnl}
        />
        <Stat
          label="กำไรรับรู้แล้ว"
          value={<span className={toneClass(t.realizedPnl)}>{fmtMoney(t.realizedPnl)}</span>}
          sub={`เงินสด ${fmtMoney(t.cash, 0)}`}
        />
        <Stat
          label="เป้ากลางรวม"
          value={`${t.targetSum.toFixed(0)}%`}
          sub="กรอบแต่ละหมวดเหลื่อมกันได้ ไม่ต้องบวกเป็น 100"
        />
      </div>

      {/* สถิติแบบเดียวกับที่แดชบอร์ดเทรดทั่วไปแสดง ต่างจาก "มูลค่ารวม" ด้านบนตรงตัวหาร:
          ที่นี่หารด้วยเงินลงทุนสุทธิ (ต้นทุนของที่ถืออยู่ตอนนี้) ไม่ใช่เงินตั้งต้น */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="เงินลงทุนสุทธิ"
          value={fmtMoney(t.costValue)}
          sub={`ต้นทุนของหุ้นที่ถืออยู่ตอนนี้ · ${p.currency}`}
        />
        <Stat
          label="ROI เทียบเงินลงทุนสุทธิ"
          value={<span className={toneClass(t.investedRoi)}>{fmtPct(t.investedRoi)}</span>}
          sub="(กำไรรับรู้ + ยังไม่ขาย) ÷ เงินลงทุนสุทธิ"
          tone={t.investedRoi}
        />
        <Stat
          label="Win Rate"
          value={
            view.tradeStats.winRate === null ? '—' : `${view.tradeStats.winRate.toFixed(1)}%`
          }
          sub={`${view.tradeStats.wins} ชนะ − ${view.tradeStats.losses} แพ้ (${view.tradeStats.totalClosedTrades} ไม้)`}
        />
        <Stat
          label="กำไรรวมทั้งหมด"
          value={
            <span className={toneClass(t.realizedPnl + t.unrealizedPnl)}>
              {fmtMoney(t.realizedPnl + t.unrealizedPnl)}
            </span>
          }
          sub="รับรู้แล้ว + ยังไม่ขาย"
          tone={t.realizedPnl + t.unrealizedPnl}
        />
      </div>

      <Card title="การเคลื่อนไหวของพอร์ต" className="mb-6">
        <PortfolioHistoryChart portfolioId={p.id} height={380} />
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="สัดส่วนจริงตอนนี้">
          <AllocationChart
            data={positions
              .filter((x) => x.marketValue > 0)
              .map((x) => ({ name: x.symbol, value: x.marketValue }))}
          />
        </Card>

        <Card title="สัดส่วนเทียบเป้า" className="lg:col-span-2">
          <GroupAllocationList groups={view.groups} currency={fx.code} />
          <details className="mt-4 rounded-xl border border-leaf/70 bg-surface/40 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-forest/70">
              ปรับตัวเลขเป้า
            </summary>
            <div className="pt-3">
              <TargetGroupEditor
                portfolioId={p.id}
                initial={groupRows}
                currency={p.currency}
              />
            </div>
          </details>
        </Card>
      </div>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="card-title">รายการหุ้นในพอร์ต</h2>
          <PortfolioActions portfolio={raw.portfolio} />
        </div>
        {positions.length === 0 ? (
          <Empty
            title="ยังไม่มีหุ้นในพอร์ตนี้"
            hint="บันทึกรายการซื้อแรกเพื่อเริ่มติดตาม"
            href={`/trades?portfolio=${p.id}`}
            cta="บันทึกการซื้อ"
          />
        ) : (
          <PositionsTable
            positions={positions}
            currency={fx.code}
            cash={t.cash}
            netWorth={t.netWorth}
            cashBand={
              cashGroup ? { label: cashGroup.bandLabel, status: cashGroup.status } : null
            }
          />
        )}
      </section>

      <section className="mb-6">
        <ClosedPositions positions={closed} currency={p.currency} />
      </section>

      <section>
        <h2 className="card-title mb-3">ประวัติซื้อขายของพอร์ตนี้ ({trades.length} รายการ)</h2>
        <TradesTable trades={trades} showPortfolio={false} />
      </section>
    </>
  );
}
