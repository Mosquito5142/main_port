import Link from 'next/link';
import {
  applyFx,
  getLevelProximity,
  getMainPortfolio,
  getPortfolioView,
  listPortfolios,
} from '@/lib/portfolio';
import { getFx } from '@/lib/currency';
import { fmtMoney, fmtPct, toneClass } from '@/lib/format';
import { Card, Delta, Empty, PageHeader, Stat, StatusPill } from '@/components/ui';
import PositionsTable from '@/components/PositionsTable';
import ClosedPositions from '@/components/ClosedPositions';
import GroupAllocationList from '@/components/GroupAllocationList';
import SyncButton from '@/components/SyncButton';
import AllocationChart from '@/components/charts/AllocationChart';
import PortfolioHistoryChart from '@/components/charts/PortfolioHistoryChart';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const portfolios = await listPortfolios();
  const picked = sp.p ? portfolios.find((x) => x.id === Number(sp.p)) : undefined;
  const main = picked ?? (await getMainPortfolio());

  if (!main) {
    return (
      <>
        <PageHeader title="ภาพรวมพอร์ต" emoji="🌱" subtitle="เริ่มต้นด้วยการสร้างพอร์ตแรกของคุณ" />
        <Empty
          title="ยังไม่มีพอร์ต"
          hint="สร้างพอร์ตหลักก่อน แล้วค่อยเพิ่มหุ้น บันทึกการซื้อขาย และตั้งสัดส่วนเป้าหมาย"
          href="/portfolios"
          cta="สร้างพอร์ตแรก"
        />
      </>
    );
  }

  // getFx / getPortfolioView / getLevelProximity ไม่ขึ้นต่อกัน — ยิงขนานกัน
  const [fx, rawView, levels] = await Promise.all([
    getFx(main.currency),
    getPortfolioView(main.id),
    getLevelProximity(),
  ]);
  const view = applyFx(rawView!, fx);
  const alerts = levels.filter((l) => l.status === 'hit' || l.status === 'near').slice(0, 8);
  const t = view.totals;
  const positions = view.positions;
  const closed = view.closed;

  const movers = [...positions]
    .filter((p) => p.changePercent !== null && p.quantity > 0)
    .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
    .slice(0, 5);


  return (
    <>
      <PageHeader
        title="ภาพรวมพอร์ต"
        emoji="🌱"
        subtitle={[
          main.name,
          'อัปเดตราคาจาก Yahoo Finance',
          view.stale ? 'ราคาบางตัวเป็นค่าที่แคชไว้' : null,
          fx.note,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="flex flex-wrap items-start gap-2">
            <SyncButton />
            <Link href="/trades" className="btn-soft">
              🧾 บันทึกซื้อขาย
            </Link>
            <Link href={`/portfolios/${main.id}`} className="btn-primary">
              เปิดพอร์ตหลัก →
            </Link>
          </div>
        }
      />

      {portfolios.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-forest/45">
            เลือกพอร์ต
          </span>
          {portfolios.map((p) => (
            <Link
              key={p.id}
              href={p.id === main.id ? '/' : `/?p=${p.id}`}
              className={
                p.id === main.id
                  ? 'badge-solid px-3 py-1'
                  : 'badge-green px-3 py-1 hover:bg-leaf/60'
              }
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat
          accent
          label="มูลค่ารวม (พอร์ต + เงินสด)"
          value={fmtMoney(t.netWorth)}
          sub={`${fx.code} · ผลตอบแทนรวม ${fmtPct(t.totalReturnPct)}`}
        />
        <Stat
          label="มูลค่าหุ้น"
          value={fmtMoney(t.marketValue)}
          sub={`ต้นทุน ${fmtMoney(t.costValue)}`}
        />
        <Stat
          label="กำไร/ขาดทุนที่ยังไม่ขาย"
          value={<span className={toneClass(t.unrealizedPnl)}>{fmtMoney(t.unrealizedPnl)}</span>}
          sub={<Delta value={t.unrealizedPct} />}
          tone={t.unrealizedPnl}
        />
        <Stat
          label="กำไรที่รับรู้แล้ว"
          value={<span className={toneClass(t.realizedPnl)}>{fmtMoney(t.realizedPnl)}</span>}
          sub="จากการขายทั้งหมด"
        />
        <Stat
          label="เงินสดคงเหลือ"
          value={fmtMoney(t.cash)}
          sub={`เงินตั้งต้น ${fmtMoney(t.capitalBase, 0)}`}
        />
      </div>

      {/* สถิติแบบเดียวกับที่แดชบอร์ดเทรดทั่วไปแสดง — ไว้เทียบกับระบบเดิม
          ต่างจาก "ผลตอบแทนรวม" ด้านบนตรงตัวหาร: ที่นี่หารด้วยเงินลงทุนสุทธิ (ต้นทุนของที่ถืออยู่ตอนนี้)
          ไม่ใช่เงินตั้งต้น ทั้งสองค่าถูกต้อง แค่ตอบคนละคำถาม */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="เงินลงทุนสุทธิ"
          value={fmtMoney(t.costValue)}
          sub={`ต้นทุนของหุ้นที่ถืออยู่ตอนนี้ · ${fx.code}`}
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
        <PortfolioHistoryChart portfolioId={main.id} />
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="สัดส่วนพอร์ตจริง" className="lg:col-span-1">
          <AllocationChart
            data={positions
              .filter((p) => p.marketValue > 0)
              .map((p) => ({ name: p.symbol, value: p.marketValue }))}
          />
          <div className="mt-2 space-y-1.5">
            {positions
              .filter((p) => p.marketValue > 0)
              .slice(0, 6)
              .map((p) => (
                <div key={p.stock_id} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-forest">{p.symbol}</span>
                  <span className="tabular-nums text-forest/60">
                    {p.weight.toFixed(2)}%
                    {p.targetPercent !== null && (
                      <span className="ml-1 text-forest/35">/ เป้า {p.targetPercent.toFixed(0)}%</span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </Card>

        <Card
          title="เรดาร์แนวรับ–แนวต้าน"
          className="lg:col-span-2"
          right={
            <Link href="/levels" className="btn-ghost btn-xs">
              ดูทั้งหมด →
            </Link>
          }
        >
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-leaf bg-mist/40 px-4 py-8 text-center text-sm text-forest/50">
              ยังไม่มีตัวไหนเข้าใกล้จุดที่รอ — เพิ่มแนวรับ/แนวต้านได้ที่หน้า “แนวรับ–แนวต้าน”
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {alerts.map((l) => (
                <Link
                  key={l.level_id}
                  href={`/stocks/${encodeURIComponent(l.symbol)}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-leaf/60 bg-surface/70 px-3 py-2.5 transition hover:border-grass hover:shadow-leafy"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-forest">{l.symbol}</span>
                      <span
                        className={
                          l.kind === 'support'
                            ? 'badge bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'badge bg-rose-50 text-rose-700 border border-rose-200'
                        }
                      >
                        {l.kind === 'support' ? 'แนวรับ' : 'แนวต้าน'} {fmtMoney(l.price)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-forest/50">
                      ราคาล่าสุด {fmtMoney(l.currentPrice)} · ห่าง{' '}
                      {l.distancePct === null ? '—' : `${Math.abs(l.distancePct).toFixed(2)}%`}
                    </div>
                  </div>
                  <StatusPill status={l.status} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card
          title="สัดส่วนพอร์ตเทียบเป้าหมาย"
          className="lg:col-span-2"
          right={
            <Link href={`/portfolios/${main.id}`} className="btn-ghost btn-xs">
              แก้ไขสัดส่วน →
            </Link>
          }
        >
          <GroupAllocationList groups={view.groups} currency={fx.code} />
        </Card>

        <Card title="ขยับแรงวันนี้">
          {movers.length === 0 ? (
            <div className="py-6 text-center text-sm text-forest/50">ยังไม่มีข้อมูลราคา</div>
          ) : (
            <div className="space-y-2">
              {movers.map((p) => (
                <div
                  key={p.stock_id}
                  className="flex items-center justify-between rounded-xl bg-mist/60 px-3 py-2"
                >
                  <div className="leading-tight">
                    <div className="font-bold text-forest">{p.symbol}</div>
                    <div className="text-xs text-forest/50">{fmtMoney(p.price)}</div>
                  </div>
                  <div className={`text-right font-bold tabular-nums ${toneClass(p.changePercent)}`}>
                    {fmtPct(p.changePercent)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 rounded-xl border border-leaf/60 bg-surface/60 p-3 text-xs text-forest/60">
            มีทั้งหมด <b>{portfolios.length}</b> พอร์ต ·{' '}
            <Link href="/compare" className="font-semibold text-grass hover:underline">
              เทียบผลตอบแทนแต่ละแผน →
            </Link>
          </div>
        </Card>
      </div>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="card-title">รายการหุ้นใน{main.name}</h2>
          <Link href={`/portfolios/${main.id}`} className="btn-ghost btn-xs">
            จัดการสัดส่วน →
          </Link>
        </div>
        {positions.length === 0 ? (
          <Empty
            title="ยังไม่มีหุ้นในพอร์ตนี้"
            hint="เริ่มจากบันทึกรายการซื้อครั้งแรก"
            href="/trades"
            cta="บันทึกการซื้อ"
          />
        ) : (
          <PositionsTable positions={positions} currency={fx.code} />
        )}
      </section>

      <ClosedPositions positions={closed} currency={fx.code} />
    </>
  );
}
