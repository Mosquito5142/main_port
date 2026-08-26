import { searchSymbol } from '@/lib/yahoo';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get('q')?.trim();
    if (!q || q.length < 1) return ok([]);
    return ok(await searchSymbol(q));
  } catch (err) {
    return handle(err);
  }
}
