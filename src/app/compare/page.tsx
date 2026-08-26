import Link from 'next/link';
import { listPortfolios } from '@/lib/portfolio';
import { Empty, PageHeader } from '@/components/ui';
import CompareChart from '@/components/charts/CompareChart';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const portfolios = await listPortfolios(true);

  return (
    <>
      <PageHeader
        title="เทียบแผนพอร์ต"
        emoji="⚖️"
        subtitle="ถ้าเอาเงินก้อนเดียวกันไปซื้อตามอีกแผนหนึ่ง ผลจะต่างกันแค่ไหน — คำนวณจากราคาย้อนหลังจริงของ Yahoo Finance"
        action={
          <Link href="/portfolios" className="btn-soft">
            🧺 จัดการพอร์ต
          </Link>
        }
      />

      {portfolios.length === 0 ? (
        <Empty
          title="ยังไม่มีพอร์ตให้เปรียบเทียบ"
          hint="สร้างพอร์ตหลัก แล้วสร้างพอร์ตจำลองด้วยเงินตั้งต้นเท่ากัน จากนั้นบันทึกหุ้นตามแผนที่อยากลอง"
          href="/portfolios"
          cta="สร้างพอร์ต"
        />
      ) : (
        <>
          <div className="mb-4 card card-pad text-sm text-forest/65">
            <b className="text-forest">วิธีอ่านกราฟ:</b> เส้นทึบคือพอร์ตหลัก เส้นประคือแผนจำลอง ·
            โหมด “% ผลตอบแทน” เทียบจากเงินตั้งต้นของแต่ละพอร์ต จึงเทียบกันได้ตรง ๆ แม้เงินไม่เท่ากัน ·
            มูลค่าแต่ละวัน = เงินสดคงเหลือ + มูลค่าหุ้นที่ถือ ณ ราคาปิดวันนั้น
          </div>
          <CompareChart portfolios={portfolios} />
        </>
      )}
    </>
  );
}
