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

/** บันทึกหมวดทั้งชุด รวมกรอบ min–max, hint และเป้ารายตัว */
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

      const targetMin = num(g.targetMin, null);
      const targetMax = num(g.targetMax, null);
      if (targetMin != null && targetMin < 0) return fail(`กรอบของ "${label}" ติดลบไม่ได้`);
      if (targetMax != null && targetMax < 0) return fail(`กรอบของ "${label}" ติดลบไม่ได้`);
      if (targetMin != null && targetMax != null && targetMin > targetMax + 0.001) {
        return fail(`กรอบของ "${label}" สลับกัน (${targetMin}–${targetMax})`);
      }

      let pct = num(g.targetPct, 0) ?? 0;
      if (pct < 0) return fail(`สัดส่วนของ "${label}" ติดลบไม่ได้`);
      // เพดานอย่างเดียว (min 0) ไม่ดันเป้ากลางขึ้นไปกลางช่วง — กันแผนไล่ซื้อให้เต็มเพดาน
      if (targetMin != null && targetMax != null) {
        if (targetMin <= 0) {
          if (pct > targetMax) pct = 0;
        } else if (pct < targetMin || pct > targetMax) {
          pct = Math.round(((targetMin + targetMax) / 2) * 10) / 10;
        }
      }

      const isOther = Boolean(g.isOther) || key === OTHER_KEY;
      const isCore = Boolean(g.isCore);
      const memberBySym = new Map<string, any>();
      for (const rawMember of Array.isArray(g.members) ? g.members : []) {
        const sym = String(rawMember?.symbol || '').toUpperCase().trim();
        if (sym) memberBySym.set(sym, rawMember);
      }

      const symbols: string[] = [];
      const symbolSource: unknown[] = Array.isArray(g.symbols) ? g.symbols : [...memberBySym.keys()];
      for (const s of symbolSource) {
        const sym = String(s || '').toUpperCase().trim();
        if (!sym || symbols.includes(sym)) continue;
        const owner = seenSymbols.get(sym);
        if (owner) return fail(`${sym} อยู่ทั้งหมวด "${owner}" และ "${label}" — เลือกหมวดเดียว`);
        seenSymbols.set(sym, label);
        symbols.push(sym);
      }
      if (!isOther && symbols.length === 0 && (pct > 0 || (targetMax ?? 0) > 0)) {
        return fail(`หมวด "${label}" ตั้งเป้าไว้แต่ยังไม่ได้ใส่หุ้น`);
      }

      const members = symbols.map((sym) => {
        const src = memberBySym.get(sym);
        return {
          symbol: sym,
          targetPct: src ? num(src.targetPct, null) : null,
          targetMin: src ? num(src.targetMin, null) : null,
          targetMax: src ? num(src.targetMax, null) : null,
          hint: src ? str(src.hint) : null,
        };
      });

      groups.push({
        key,
        label,
        targetPct: pct,
        targetMin,
        targetMax,
        hint: str(g.hint),
        color: str(g.color) ?? '#66BB6A',
        sortOrder: 0,
        isOther,
        isCore,
        symbols,
        members,
      });
    }

    // ตรวจผลรวมของเป้ากลาง ไม่ใช่ผลรวมของเพดาน (กรอบเหลื่อมกันได้)
    const total = groups.reduce((a, g) => a + g.targetPct, 0);
    if (total > 100.0001) {
      return fail(`เป้ากลางรวมเกิน 100% (ตอนนี้ ${total.toFixed(2)}%)`);
    }

    await saveTargetGroups(pid, groups);
    return ok({ saved: groups.length, total });
  } catch (err) {
    return handle(err);
  }
}
