import { getPortfolioView, listPortfolios } from '@/lib/portfolio';
import { Empty, PageHeader } from '@/components/ui';
import AverageCalculator from '@/components/AverageCalculator';
import NativeCurrencyNote from '@/components/NativeCurrencyNote';
import type { PortfolioLite } from '@/components/TradeForm';

export const dynamic = 'force-dynamic';

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const sp = await searchParams;
  const portfolios = await listPortfolios(true);

  if (!portfolios.length) {
    return (
      <>
        <PageHeader title="คำนวณถัวเฉลี่ย" emoji="🧮" />
        <Empty
          title="ต้องมีพอร์ตก่อน"
          hint="สร้างพอร์ตแล้วบันทึกหุ้นสักตัวเพื่อให้ระบบดึงต้นทุนมาคำนวณให้"
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

  return (
    <>
      <PageHeader
        title="คำนวณถัวเฉลี่ย & สัดส่วน"
        emoji="🧮"
        subtitle="ลองใส่จำนวนที่จะซื้อเพิ่ม ดูว่าต้นทุนเฉลี่ยและสัดส่วนในพอร์ตจะเปลี่ยนไปเท่าไหร่ ก่อนกดซื้อจริง"
      />
      <NativeCurrencyNote reason="ต้นทุนและราคาที่ใช้คำนวณอิงสกุลเงินที่ซื้อขายจริง" />
      <AverageCalculator portfolios={lite} defaultSymbol={sp.symbol?.toUpperCase()} />
    </>
  );
}
