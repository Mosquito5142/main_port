import Link from 'next/link';
import { getPortfolioView, listPortfolios, listStocks, listTrades } from '@/lib/portfolio';
import { Empty, PageHeader } from '@/components/ui';
import TradeForm, { type PortfolioLite } from '@/components/TradeForm';
import TradesTable from '@/components/TradesTable';
import NativeCurrencyNote from '@/components/NativeCurrencyNote';

export const dynamic = 'force-dynamic';

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string; symbol?: string }>;
}) {
  const sp = await searchParams;
  const filterPortfolio = sp.portfolio ? Number(sp.portfolio) : undefined;

  // สาม query นี้ไม่ขึ้นต่อกัน — ยิงขนานกัน ไม่ต้องรอต่อคิว
  const [portfolios, stocks, trades] = await Promise.all([
    listPortfolios(true),
    listStocks(),
    listTrades(filterPortfolio),
  ]);

  if (!portfolios.length) {
    return (
      <>
        <PageHeader title="บันทึกซื้อขาย" emoji="🧾" />
        <Empty
          title="ต้องมีพอร์ตก่อน"
          hint="สร้างพอร์ตอย่างน้อย 1 พอร์ตแล้วค่อยกลับมาบันทึกรายการ"
          href="/portfolios"
          cta="ไปสร้างพอร์ต"
        />
      </>
    );
  }

  const views = await Promise.all(portfolios.map((p) => getPortfolioView(p.id)));
  const lite: PortfolioLite[] = views.filter(Boolean).map((v) => ({
    id: v!.portfolio.id,
    name: v!.portfolio.name,
    kind: v!.portfolio.kind,
    currency: v!.portfolio.currency,
    cash: v!.totals.cash,
    marketValue: v!.totals.marketValue,
    positions: v!.positions.map((p) => ({
      stock_id: p.stock_id,
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgCost,
      marketValue: p.marketValue,
      price: p.price,
    })),
  }));

  const shown = sp.symbol
    ? trades.filter((t) => t.symbol?.toUpperCase() === sp.symbol!.toUpperCase())
    : trades;

  return (
    <>
      <PageHeader
        title="บันทึกซื้อขาย"
        emoji="🧾"
        subtitle="กรอกรายการซื้อ–ขาย ระบบจะคำนวณต้นทุนเฉลี่ยใหม่และสัดส่วนในพอร์ตให้ทันที"
        action={
          <Link href="/calculator" className="btn-soft">
            🧮 เครื่องคำนวณเต็มรูปแบบ
          </Link>
        }
      />

      <NativeCurrencyNote reason="ราคาที่กรอกต้องเป็นสกุลเดียวกับที่ซื้อขายจริง" />

      <div className="mb-8">
        <TradeForm
          portfolios={lite}
          stocks={stocks.map((s) => ({ id: s.id, symbol: s.symbol, name: s.name }))}
          defaultPortfolioId={filterPortfolio}
          defaultSymbol={sp.symbol?.toUpperCase()}
        />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="card-title">ประวัติทั้งหมด ({shown.length})</h2>
          <div className="ml-auto flex flex-wrap gap-1">
            <Link
              href="/trades"
              className={!filterPortfolio ? 'badge-solid' : 'badge-green hover:bg-leaf/60'}
            >
              ทุกพอร์ต
            </Link>
            {portfolios.map((p) => (
              <Link
                key={p.id}
                href={`/trades?portfolio=${p.id}`}
                className={
                  filterPortfolio === p.id ? 'badge-solid' : 'badge-green hover:bg-leaf/60'
                }
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
        <TradesTable trades={shown} />
      </section>
    </>
  );
}
