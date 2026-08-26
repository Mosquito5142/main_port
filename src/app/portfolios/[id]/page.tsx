import Link from 'next/link';
import { notFound } from 'next/navigation';
import { applyFx, getPortfolioView, listTrades } from '@/lib/portfolio';
import { fmtMoney, fmtPct, toneClass } from '@/lib/format';
import { Card, Empty, PageHeader, Stat } from '@/components/ui';
import PositionsTable from '@/components/PositionsTable';
import TradesTable from '@/components/TradesTable';
import ClosedPositions from '@/components/ClosedPositions';
import TargetGroupEditor, { type EditableGroup } from '@/components/TargetGroupEditor';
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

  const groupRows: EditableGroup[] = view.groups.map((g) => ({
    key: g.key,
    label: g.label,
    targetPct: g.targetPct,
    color: g.color,
    symbols: g.symbols,
    isOther: g.isOther,
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
          label="เป้าหมายที่ตั้งไว้รวม"
          value={`${t.targetSum.toFixed(2)}%`}
          sub={
            Math.abs(t.targetSum - 100) < 0.01
              ? 'ครบ 100% แล้ว'
              : t.targetSum > 100
                ? 'เกิน 100%'
                : `ยังเหลืออีก ${(100 - t.targetSum).toFixed(2)}%`
          }
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

        <Card title="สัดส่วนเป้าหมายรายหมวด" className="lg:col-span-2">
          <TargetGroupEditor
            portfolioId={p.id}
            initial={groupRows}
            currency={p.currency}
          />
        </Card>
      </div>

      <section className="mb-6">
        <h2 className="card-title mb-3">รายการหุ้นในพอร์ต</h2>
        {positions.length === 0 ? (
          <Empty
            title="ยังไม่มีหุ้นในพอร์ตนี้"
            hint="บันทึกรายการซื้อแรกเพื่อเริ่มติดตาม"
            href={`/trades?portfolio=${p.id}`}
            cta="บันทึกการซื้อ"
          />
        ) : (
          <PositionsTable positions={positions} currency={p.currency} />
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
