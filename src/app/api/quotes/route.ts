import { getQuotes } from '@/lib/yahoo';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get('symbols') ?? '';
    const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!symbols.length) return ok([]);
    const map = await getQuotes(symbols);
    return ok([...map.values()]);
  } catch (err) {
    return handle(err);
  }
}
