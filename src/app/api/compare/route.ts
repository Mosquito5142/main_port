import { comparePortfolios } from '@/lib/portfolio';
import { fail, handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const ids = (sp.get('ids') ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return fail('ต้องเลือกพอร์ตอย่างน้อย 1 พอร์ต');
    const range = sp.get('range') ?? '1y';
    return ok(await comparePortfolios(ids, range));
  } catch (err) {
    return handle(err);
  }
}
