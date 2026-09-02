import Link from 'next/link';
import { getMainPortfolio, listPortfolios } from '@/lib/portfolio';
import { Empty, PageHeader } from '@/components/ui';
import InvestmentPlanner from '@/components/InvestmentPlanner';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const portfolios = await listPortfolios(true);

  if (!portfolios.length) {
    return (
      <>
        <PageHeader title="วางแผนลงเงิน" emoji="🧭" />
        <Empty
          title="ต้องมีพอร์ตก่อน"
          hint="สร้างพอร์ตแล้วตั้งสัดส่วนเป้าหมายรายหมวด ระบบถึงจะคำนวณให้ได้"
          href="/portfolios"
          cta="ไปสร้างพอร์ต"
        />
      </>
    );
  }

  const main = await getMainPortfolio();
  const target = main ?? portfolios[0];

  return (
    <>
      <PageHeader
        title="วางแผนลงเงิน"
        emoji="🧭"
        subtitle={`เดือนนี้มีเงินเท่านี้ ควรเติมตัวไหนเท่าไหร่ — คิดจากสัดส่วนเป้าหมายของ "${target.name}" ที่ตั้งไว้`}
        action={
          <Link href={`/portfolios/${target.id}`} className="btn-soft">
            ⚖️ แก้สัดส่วนเป้าหมาย →
          </Link>
        }
      />
      <InvestmentPlanner portfolioId={target.id} />
    </>
  );
}
