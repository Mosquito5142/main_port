import { query } from '@/lib/db';
import { listPortfolios } from '@/lib/portfolio';
import { fail, handle, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const includeArchived =
      new URL(req.url).searchParams.get('archived') === '1';
    return ok(await listPortfolios(includeArchived));
  } catch (err) {
    return handle(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = str(body.name);
    if (!name) return fail('กรุณาใส่ชื่อพอร์ต');
    const kind = body.kind === 'main' ? 'main' : 'plan';

    const rows = await query(
      `INSERT INTO gp_portfolios (name, kind, description, currency, initial_cash, color)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        name,
        kind,
        str(body.description),
        str(body.currency) ?? 'THB',
        num(body.initial_cash, 0),
        str(body.color) ?? (kind === 'main' ? '#1B5E20' : '#66BB6A'),
      ]
    );
    return ok(rows[0], { status: 201 });
  } catch (err) {
    return handle(err);
  }
}
