import { listTargetGroups, saveTargetGroups, OTHER_KEY } from '@/lib/targetGroups';
import { fail, handle, num, ok, str } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const pid = new URL(req.url).searchParams.get('portfolio_id');
    if (!pid) return fail('ต้องระบุ portfolio_id');
    return ok(await listTargetGroups(Number(pid)));
  } catch (err) {
    return handle(err);
  }
}

/** บันทึกหมวดทั้งชุด: { portfolio_id, groups: [{key,label,targetPct,color,symbols}] } */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const pid = num(body.portfolio_id);
    if (!pid) return fail('ต้องระบุ portfolio_id');

    const raw: any[] = Array.isArray(body.groups) ? body.groups : [];
    if (!raw.length) return fail('ต้องมีอย่างน้อย 1 หมวด');

    const seenKeys = new Set<string>();
    const seenSymbols = new Map<string, string>();
    const groups = [];

    for (const g of raw) {
      const label = str(g.label);
      if (!label) return fail('ชื่อหมวดห้ามว่าง');

      const key =
        str(g.key) ??
        label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') ??
        '';
      if (!key) return fail(`หมวด "${label}" ตั้งชื่อ key ไม่ได้`);
      if (seenKeys.has(key)) return fail(`มีหมวดซ้ำกัน: ${key}`);
      seenKeys.add(key);

      const pct = num(g.targetPct, 0) ?? 0;
      if (pct < 0) return fail(`สัดส่วนของ "${label}" ติดลบไม่ได้`);

      const isOther = Boolean(g.isOther) || key === OTHER_KEY;
      const symbols: string[] = [];
      for (const s of Array.isArray(g.symbols) ? g.symbols : []) {
        const sym = String(s || '').toUpperCase().trim();
        if (!sym) continue;
        // หุ้นตัวเดียวอยู่ได้หมวดเดียว ไม่งั้นสัดส่วนจะนับซ้ำ
        const owner = seenSymbols.get(sym);
        if (owner) return fail(`${sym} อยู่ทั้งหมวด "${owner}" และ "${label}" — เลือกหมวดเดียว`);
        seenSymbols.set(sym, label);
        symbols.push(sym);
      }
      if (!isOther && symbols.length === 0 && pct > 0) {
        return fail(`หมวด "${label}" ตั้งเป้า ${pct}% แต่ยังไม่ได้ใส่หุ้น`);
      }

      groups.push({
        key,
        label,
        targetPct: pct,
        color: str(g.color) ?? '#66BB6A',
        sortOrder: 0,
        isOther,
        symbols,
      });
    }

    const total = groups.reduce((a, g) => a + g.targetPct, 0);
    if (total > 100.0001) return fail(`สัดส่วนรวมเกิน 100% (ตอนนี้ ${total.toFixed(2)}%)`);

    await saveTargetGroups(pid, groups);
    return ok({ saved: groups.length, total });
  } catch (err) {
    return handle(err);
  }
}
