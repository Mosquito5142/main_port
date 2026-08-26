import { getPortfolio, getPortfolioHistory } from '@/lib/portfolio';
import { getFx } from '@/lib/currency';
import { fail, handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RANGES = new Set(['1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const portfolio = await getPortfolio(Number(id));
    if (!portfolio) return fail('ไม่พบพอร์ตนี้', 404);

    const raw = new URL(req.url).searchParams.get('range') ?? '1y';
    const range = RANGES.has(raw) ? raw : '1y';

    // ให้กราฟใช้สกุลเงินเดียวกับที่ผู้ใช้เลือกดูอยู่
    const fx = await getFx(portfolio.currency);
    return ok(await getPortfolioHistory(Number(id), range, fx));
  } catch (err) {
    return handle(err);
  }
}
