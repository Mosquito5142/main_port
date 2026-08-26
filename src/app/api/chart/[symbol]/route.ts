import { fetchChart } from '@/lib/yahoo';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

const RANGES = new Set(['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);
const INTERVALS = new Set(['5m', '15m', '60m', '1d', '1wk', '1mo']);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const sp = new URL(req.url).searchParams;
    const range = sp.get('range') ?? '6mo';
    const interval = sp.get('interval') ?? '1d';
    return ok(
      await fetchChart(
        decodeURIComponent(symbol),
        RANGES.has(range) ? range : '6mo',
        INTERVALS.has(interval) ? interval : '1d'
      )
    );
  } catch (err) {
    return handle(err);
  }
}
