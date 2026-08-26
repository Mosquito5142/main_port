import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one, query } from '@/lib/db';
import { getQuote } from '@/lib/yahoo';
import { listPortfolios, listTrades } from '@/lib/portfolio';
import { avgCost, buildLots, emptyLot } from '@/lib/calc';
import { fmtMoney, fmtPct, fmtQty, toneClass } from '@/lib/format';
import { Card, PageHeader, Stat } from '@/components/ui';
import PriceChart from '@/components/charts/PriceChart';
import LevelEditor from '@/components/LevelEditor';
import TradesTable from '@/components/TradesTable';
import DeleteButton from '@/components/DeleteButton';
import type { Level, Stock, Trade } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  const stock = await one<Stock>(`SELECT * FROM gp_stocks WHERE symbol = $1`, [symbol]);
  if (!stock) notFound();

  const [quote, levels, trades, portfolios] = await Promise.all([
    getQuote(stock.symbol),
    query<Level>(`SELECT * FROM gp_levels WHERE stock_id = $1 ORDER BY price DESC`, [stock.id]),
    listTrades(undefined, stock.id),
    listPortfolios(true),
  ]);

  // สรุปการถือครองแยกตามพอร์ต
  const byPortfolio = portfolios
    .map((p) => {
      const pt = trades.filter((t) => t.portfolio_id === p.id);
      const lot = buildLots(pt as Trade[]).get(stock.id) ?? emptyLot();
      const avg = avgCost(lot);
      const mv = quote.price !== null ? lot.quantity * quote.price : lot.costValue;
      return {
        portfolio: p,
        quantity: lot.quantity,
        avg,
        cost: lot.costValue,
        marketValue: mv,
        pnl: mv - lot.costValue,
        pnlPct: lot.costValue > 0 ? ((mv - lot.costValue) / lot.costValue) * 100 : null,
        realized: lot.realizedPnl,
      };
    })
    .filter((x) => x.quantity > 0 || x.realized !== 0);

  // ยึดพอร์ตที่ถือหุ้นตัวนี้อยู่มากที่สุดเป็นตัวแทนในการ์ดสรุป (ถ้าไม่มีใครถือ ใช้ตัวแรก)
  const mainHold =
    [...byPortfolio].sort((a, b) => b.quantity - a.quantity)[0] ?? undefined;
  const holding = mainHold && mainHold.quantity > 0 ? mainHold : undefined;
  const totalQty = byPortfolio.reduce((a, b) => a + b.quantity, 0);
  const totalRealized = byPortfolio.reduce((a, b) => a + b.realized, 0);

  const activeLevels = levels.filter((l) => l.is_active);
  const nearest = activeLevels
    .map((l) => ({
      l,
      pct: quote.price ? ((quote.price - Number(l.price)) / Number(l.price)) * 100 : null,
    }))
    .filter((x) => x.pct !== null)
    .sort((a, b) => Math.abs(a.pct!) - Math.abs(b.pct!))[0];

  return (
    <>
      <PageHeader
        title={stock.symbol}
        emoji="📈"
        subtitle={`${stock.name ?? '—'} · ${stock.exchange ?? '—'} · ${stock.currency ?? ''}`}
        action={
          <div className="flex gap-2">
            <Link href="/" className="btn-soft">
              ← ภาพรวม
            </Link>
            <Link
              href={`/calculator?symbol=${encodeURIComponent(stock.symbol)}`}
              className="btn-soft"
            >
              🧮 คำนวณถัวเฉลี่ย
            </Link>
            <Link href={`/trades?symbol=${encodeURIComponent(stock.symbol)}`} className="btn-primary">
              ＋ บันทึกซื้อขาย
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat
          accent
          label="ราคาล่าสุด"
          value={fmtMoney(quote.price)}
          sub={`${fmtPct(quote.changePercent)} · ปิดก่อนหน้า ${fmtMoney(quote.previousClose)}`}
        />
        <Stat label="ช่วงราคาวันนี้" value={`${fmtMoney(quote.dayLow)} – ${fmtMoney(quote.dayHigh)}`} sub={quote.stale ? 'ราคาจากแคช' : 'สดจาก Yahoo'} />
        <Stat
          label="ถืออยู่ทั้งหมด"
          value={fmtQty(totalQty)}
          sub={
            holding
              ? `ต้นทุนเฉลี่ย ${fmtMoney(holding.avg)} · ${holding.portfolio.name}`
              : 'ปิดสถานะหมดแล้ว'
          }
        />
        <Stat
          label={holding ? `กำไร/ขาดทุน · ${holding.portfolio.name}` : 'กำไรที่รับรู้แล้ว'}
          value={
            <span className={toneClass(holding ? holding.pnl : totalRealized)}>
              {fmtMoney(holding ? holding.pnl : totalRealized)}
            </span>
          }
          sub={holding ? fmtPct(holding.pnlPct) : 'จากการขายทั้งหมด'}
          tone={holding ? holding.pnl : totalRealized}
        />
        <Stat
          label="แนวที่ใกล้ที่สุด"
          value={nearest ? fmtMoney(Number(nearest.l.price)) : '—'}
          sub={
            nearest
              ? `${nearest.l.kind === 'support' ? 'แนวรับ' : 'แนวต้าน'} · ห่าง ${Math.abs(nearest.pct!).toFixed(2)}%`
              : 'ยังไม่ได้ตั้งแนว'
          }
        />
      </div>

      <Card title="กราฟราคา + แนวรับแนวต้าน" className="mb-6">
        <PriceChart
          symbol={stock.symbol}
          levels={activeLevels.map((l) => ({
            id: l.id,
            kind: l.kind,
            price: Number(l.price),
          }))}
          avgCost={holding ? holding.avg : null}
        />
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="แนวรับ – แนวต้าน">
          <LevelEditor
            stockId={stock.id}
            symbol={stock.symbol}
            levels={levels.map((l) => ({ ...l, price: Number(l.price) }))}
            currentPrice={quote.price}
          />
        </Card>

        <Card
          title="การถือครองแยกตามพอร์ต"
          right={
            <DeleteButton
              url={`/api/stocks/${stock.id}`}
              confirmText={`ลบ ${stock.symbol} ออกจากระบบ? รายการซื้อขายและแนวทั้งหมดจะถูกลบด้วย`}
              label="🗑 ลบหุ้นนี้"
              className="btn-danger btn-xs"
              redirectTo="/"
            />
          }
        >
          {byPortfolio.length === 0 ? (
            <div className="rounded-xl border border-dashed border-leaf bg-mist/40 px-4 py-8 text-center text-sm text-forest/50">
              ยังไม่มีการซื้อหุ้นตัวนี้ในพอร์ตไหนเลย
            </div>
          ) : (
            <div className="space-y-2">
              {byPortfolio.map((h) => (
                <div
                  key={h.portfolio.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-leaf/60 bg-surface/70 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/portfolios/${h.portfolio.id}`}
                      className="font-semibold text-forest hover:underline"
                    >
                      {h.portfolio.name}
                    </Link>
                    <div className="text-xs text-forest/50">
                      {fmtQty(h.quantity)} หุ้น · ต้นทุน {fmtMoney(h.avg)} · มูลค่า{' '}
                      {fmtMoney(h.marketValue)}
                    </div>
                  </div>
                  <div className={`text-right font-bold tabular-nums ${toneClass(h.pnl)}`}>
                    {fmtMoney(h.pnl)}
                    <div className="text-xs font-semibold">{fmtPct(h.pnlPct)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <section>
        <h2 className="card-title mb-3">ประวัติซื้อขาย {stock.symbol}</h2>
        <TradesTable trades={trades} />
      </section>
    </>
  );
}
