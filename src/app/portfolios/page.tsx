import Link from 'next/link';
import { applyFx, getPortfolioView, listPortfolios } from '@/lib/portfolio';
import { getFx } from '@/lib/currency';
import { fmtMoney, fmtPct, toneClass } from '@/lib/format';
import { Empty, PageHeader } from '@/components/ui';
import PortfolioForm from '@/components/PortfolioForm';
import PortfolioActions from '@/components/PortfolioActions';

export const dynamic = 'force-dynamic';

export default async function PortfoliosPage() {
  const portfolios = await listPortfolios(true);
  const views = await Promise.all(
    portfolios.map(async (p) => {
      const raw = await getPortfolioView(p.id);
      if (!raw) return null;
      return applyFx(raw, await getFx(p.currency));
    })
  );

  return (
    <>
      <PageHeader
        title="พอร์ตของฉัน"
        emoji="🧺"
        subtitle="พอร์ตหลักคือของจริงที่ซื้อขาย ส่วนพอร์ตจำลองเอาไว้ลองแผนอื่นด้วยเงินก้อนเดียวกัน"
        action={<PortfolioForm />}
      />

      {portfolios.length === 0 ? (
        <Empty title="ยังไม่มีพอร์ต" hint="กดปุ่ม “สร้างพอร์ตใหม่” ด้านบนเพื่อเริ่มต้น" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portfolios.map((p, i) => {
            const v = views[i];
            const t = v?.totals;
            return (
              <div key={p.id} className="card card-pad flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-9 w-9 shrink-0 rounded-2xl shadow-leafy"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${p.color} 0%, #1B5E20 100%)`,
                      }}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/portfolios/${p.id}`}
                        className="block truncate text-lg font-extrabold text-forest hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={p.kind === 'main' ? 'badge-solid' : 'badge-green'}>
                          {p.kind === 'main' ? 'พอร์ตหลัก' : 'แผนจำลอง'}
                        </span>
                        <span className="text-xs text-forest/45">
                          {v?.portfolio.currency ?? p.currency}
                        </span>
                        {p.is_archived && (
                          <span className="badge bg-slate-100 text-slate-500">เก็บเข้าคลัง</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {p.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-forest/55">{p.description}</p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-mist/70 px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-forest/50">
                      มูลค่ารวม
                    </dt>
                    <dd className="font-extrabold tabular-nums text-forest">
                      {fmtMoney(t?.netWorth ?? 0)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-mist/70 px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-forest/50">
                      ผลตอบแทน
                    </dt>
                    <dd className={`font-extrabold tabular-nums ${toneClass(t?.totalReturnPct)}`}>
                      {fmtPct(t?.totalReturnPct)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-mist/70 px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-forest/50">
                      จำนวนหุ้น
                    </dt>
                    <dd className="font-extrabold tabular-nums text-forest">
                      {v?.positions.filter((x) => x.quantity > 0).length ?? 0} ตัว
                    </dd>
                  </div>
                  <div className="rounded-xl bg-mist/70 px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-forest/50">
                      เงินสด
                    </dt>
                    <dd className="font-extrabold tabular-nums text-forest">
                      {fmtMoney(t?.cash ?? 0, 0)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-leaf/50 pt-3">
                  <Link href={`/portfolios/${p.id}`} className="btn-soft btn-xs">
                    เปิดพอร์ต →
                  </Link>
                  <PortfolioActions portfolio={p} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 card card-pad text-sm text-forest/65">
        <b className="text-forest">เคล็ดลับการเทียบแผน:</b> ตั้ง “เงินตั้งต้น” ของพอร์ตจำลองให้เท่ากับพอร์ตหลัก
        แล้วบันทึกซื้อหุ้นตามแผนที่อยากลอง จากนั้นไปหน้า{' '}
        <Link href="/compare" className="font-semibold text-grass hover:underline">
          เทียบแผนพอร์ต
        </Link>{' '}
        เพื่อดูกราฟผลตอบแทนซ้อนกัน
      </div>
    </>
  );
}
