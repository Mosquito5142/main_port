import 'server-only';
import { getPortfolioView, getLevelProximity } from './portfolio';
import type { PortfolioView } from './portfolio';
import { getQuotes } from './yahoo';

/**
 * เครื่องคำนวณ "เดือนนี้มีเงินเท่านี้ ควรเติมตัวไหนเท่าไหร่"
 *
 * ตัวเลขทุกตัวคำนวณจากสูตรตรง ๆ ในไฟล์นี้ ไม่ได้ให้ AI เดา — AI (ถ้าเปิดใช้)
 * มีหน้าที่แค่สรุปเป็นภาษาคน/ทักท้วงจากตัวเลขชุดเดียวกันนี้เท่านั้น
 *
 * หลักการ: เติมเงินเข้าหมวดที่ "ห่างจากเป้าที่ตั้งไว้เองมากที่สุดก่อน" (rebalance)
 * ไม่ใช่การเลือกหุ้นให้ — สัดส่วนเป้าหมายมาจากที่ผู้ใช้ตั้งไว้เองในหน้าพอร์ต
 */

export interface PlanBuy {
  symbol: string;
  name: string | null;
  groupKey: string;
  groupLabel: string;
  /** เงินที่แนะนำให้ลงตัวนี้ (สกุลเดียวกับพอร์ต) */
  amount: number;
  price: number;
  /** จำนวนหุ้นที่จะได้ (เศษหุ้นได้) */
  quantity: number;

  // ── สถานะปัจจุบันของไม้ที่ถืออยู่ ──
  heldQuantity: number;
  currentAvgCost: number | null;
  /** ราคาตอนนี้ห่างจากต้นทุนเฉลี่ยกี่ % (ติดลบ = ราคาต่ำกว่าทุน = ได้เฉลี่ยลง) */
  vsAvgCostPct: number | null;

  // ── ผลหลังเติมเงินก้อนนี้ ──
  newAvgCost: number;
  /** ต้นทุนเฉลี่ยเปลี่ยนไปกี่ % (ติดลบ = ถัวลงมา) */
  avgCostChangePct: number | null;
  newQuantity: number;
  newCostValue: number;

  // ── บริบทประกอบการตัดสินใจ ──
  /** แนวรับที่ใกล้ที่สุดที่อยู่ "ใต้" ราคาปัจจุบัน */
  nearestSupport: number | null;
  supportDistancePct: number | null;
  /** สัดส่วนของตัวนี้ตอนนี้ / เป้าหมาย */
  weightNow: number;
  weightTarget: number;
}

export interface PlanGroup {
  key: string;
  label: string;
  color: string;
  targetPct: number;
  actualPctNow: number;
  /** สัดส่วนหลังลงเงินตามแผนนี้ */
  actualPctAfter: number;
  /** เงินที่ยังขาดอยู่เพื่อเข้าเป้า (ก่อนเติม) */
  gap: number;
  /** เงินที่แผนนี้จัดสรรให้หมวดนี้ */
  allocated: number;
}

export interface InvestmentPlan {
  currency: string;
  budget: number;
  /** เงินที่จัดสรรได้จริง (อาจน้อยกว่า budget ถ้าทุกหมวดเข้าเป้าหมดแล้ว) */
  allocated: number;
  leftover: number;
  buys: PlanBuy[];
  groups: PlanGroup[];
  totals: {
    marketValueNow: number;
    cash: number;
    /** ฐานที่ใช้คิดสัดส่วน หลังใส่เงินใหม่เข้าไปแล้ว */
    potAfter: number;
  };
  warnings: string[];
}

const EPS = 1e-9;

export async function buildInvestmentPlan(
  portfolioId: number,
  budget: number
): Promise<InvestmentPlan | null> {
  const view: PortfolioView | null = await getPortfolioView(portfolioId);
  if (!view) return null;

  const warnings: string[] = [];
  const currency = view.portfolio.currency ?? 'USD';

  const marketValueNow = view.totals.marketValue;
  const cash = view.totals.cash;
  // ฐานคิดสัดส่วนหลังเติมเงิน = มูลค่าหุ้นตอนนี้ + เงินสด + เงินก้อนใหม่
  // (ใช้ฐานเดียวกับที่หน้าพอร์ตใช้ คือรวมเงินสดด้วย)
  const potAfter = marketValueNow + cash + budget;

  // ── 1. หาช่องว่างรายหมวด (เฉพาะหมวดที่ตั้งเป้าไว้ ไม่รวม "อื่นๆ/เงินสด") ──
  const planGroups = view.groups
    .filter((g) => !g.isOther && g.targetPct > 0)
    .map((g) => {
      const targetValueAfter = (potAfter * g.targetPct) / 100;
      return {
        key: g.key,
        label: g.label,
        color: g.color,
        targetPct: g.targetPct,
        actualPctNow: g.actualPct,
        marketValue: g.marketValue,
        symbols: g.symbols,
        gap: targetValueAfter - g.marketValue, // + = ยังขาด ต้องเติม
        allocated: 0,
        actualPctAfter: 0,
      };
    });

  if (!planGroups.length) {
    warnings.push('ยังไม่ได้ตั้งสัดส่วนเป้าหมายรายหมวด — ไปตั้งที่หน้ารายละเอียดพอร์ตก่อน');
    return {
      currency, budget, allocated: 0, leftover: budget,
      buys: [], groups: [],
      totals: { marketValueNow, cash, potAfter },
      warnings,
    };
  }

  // ── 2. แบ่งเงินตามสัดส่วนของช่องว่าง (หมวดที่ห่างเป้ามากได้เยอะกว่า) ──
  const positiveGap = planGroups.filter((g) => g.gap > EPS);
  const totalGap = positiveGap.reduce((a, g) => a + g.gap, 0);

  let allocated = 0;
  if (totalGap > EPS) {
    if (totalGap >= budget) {
      // เงินไม่พอปิดช่องว่างทั้งหมด → แบ่งตามสัดส่วนช่องว่าง
      for (const g of positiveGap) {
        g.allocated = (budget * g.gap) / totalGap;
        allocated += g.allocated;
      }
    } else {
      // เงินเหลือหลังปิดช่องว่างครบ → ปิดให้เต็มก่อน ที่เหลือแบ่งตามน้ำหนักเป้าหมาย
      for (const g of positiveGap) g.allocated = g.gap;
      allocated = totalGap;
      const rest = budget - totalGap;
      const targetSum = planGroups.reduce((a, g) => a + g.targetPct, 0);
      if (targetSum > EPS) {
        for (const g of planGroups) {
          const extra = (rest * g.targetPct) / targetSum;
          g.allocated += extra;
          allocated += extra;
        }
      }
      warnings.push(
        'เงินก้อนนี้มากกว่าที่ต้องใช้ปิดช่องว่างทั้งหมด — ส่วนที่เกินถูกแบ่งตามน้ำหนักเป้าหมาย'
      );
    }
  } else {
    warnings.push('ทุกหมวดถึงเป้าหรือเกินเป้าแล้ว — ไม่มีหมวดไหนที่ต้องเติมเพื่อเข้าเป้า');
  }

  // ── 3. แตกเงินของแต่ละหมวดลงรายตัว ตามช่องว่างรายตัว ──
  const posBySymbol = new Map(view.positions.map((p) => [p.symbol, p]));

  // หุ้นที่ตั้งเป้าไว้แต่ยังไม่เคยซื้อ จะไม่มีอยู่ใน positions เลยไม่มีราคา
  // ต้องดึงราคาสดมาเอง ไม่งั้นตัวใหม่ ๆ จะถูกข้ามทั้งที่เป็นตัวที่ "ควรเติม" ที่สุด
  const missingPrice = [
    ...new Set(
      planGroups
        .flatMap((g) => g.symbols)
        .filter((s) => !(posBySymbol.get(s)?.price ?? 0))
    ),
  ];
  const extraQuotes = missingPrice.length
    ? await getQuotes(missingPrice).catch(() => new Map())
    : new Map();
  const levels = await getLevelProximity(true).catch(() => []);
  const supportsBySymbol = new Map<string, number[]>();
  for (const l of levels) {
    if (l.kind !== 'support') continue;
    const arr = supportsBySymbol.get(l.symbol) ?? [];
    arr.push(l.price);
    supportsBySymbol.set(l.symbol, arr);
  }

  const buys: PlanBuy[] = [];

  for (const g of planGroups) {
    if (g.allocated <= EPS || !g.symbols.length) continue;

    // กติกาเดียวกับหน้าพอร์ต: เป้ารายตัว = เป้าหมวด ÷ จำนวนหุ้นในหมวด
    const perSymbolTarget = (potAfter * g.targetPct) / 100 / g.symbols.length;

    const cand = g.symbols.map((sym) => {
      const pos = posBySymbol.get(sym);
      const mv = pos?.marketValue ?? 0;
      return { sym, pos, gap: perSymbolTarget - mv };
    });

    const posGaps = cand.filter((c) => c.gap > EPS);
    const gapSum = posGaps.reduce((a, c) => a + c.gap, 0);
    // ถ้าทุกตัวในหมวดเกินเป้าหมดแล้ว ให้กระจายเท่า ๆ กันแทน
    const targets = gapSum > EPS ? posGaps : cand;
    const weightOf = (c: (typeof cand)[number]) =>
      gapSum > EPS ? c.gap / gapSum : 1 / cand.length;

    for (const c of targets) {
      const amount = g.allocated * weightOf(c);
      if (amount <= EPS) continue;

      const quoted = extraQuotes.get(c.sym)?.price ?? null;
      const price = c.pos?.price ?? quoted ?? null;
      if (!price || price <= 0) {
        warnings.push(`${c.sym}: ดึงราคาล่าสุดไม่ได้ เลยคำนวณจำนวนหุ้นไม่ได้ (ข้ามตัวนี้)`);
        continue;
      }

      const heldQty = c.pos?.quantity ?? 0;
      const avg = c.pos && heldQty > EPS ? c.pos.avgCost : null;
      const qty = amount / price;
      const oldCost = avg !== null ? avg * heldQty : 0;
      const newQty = heldQty + qty;
      const newCostValue = oldCost + amount;
      const newAvg = newQty > EPS ? newCostValue / newQty : price;

      // แนวรับที่ใกล้ที่สุดที่อยู่ใต้ราคาปัจจุบัน
      const below = (supportsBySymbol.get(c.sym) ?? [])
        .filter((p) => p < price)
        .sort((a, b) => b - a);
      const nearestSupport = below[0] ?? null;

      buys.push({
        symbol: c.sym,
        name: c.pos?.name ?? extraQuotes.get(c.sym)?.shortName ?? null,
        groupKey: g.key,
        groupLabel: g.label,
        amount,
        price,
        quantity: qty,
        heldQuantity: heldQty,
        currentAvgCost: avg,
        vsAvgCostPct: avg && avg > EPS ? ((price - avg) / avg) * 100 : null,
        newAvgCost: newAvg,
        avgCostChangePct: avg && avg > EPS ? ((newAvg - avg) / avg) * 100 : null,
        newQuantity: newQty,
        newCostValue,
        nearestSupport,
        supportDistancePct:
          nearestSupport !== null ? ((price - nearestSupport) / price) * 100 : null,
        weightNow: potAfter > EPS ? ((c.pos?.marketValue ?? 0) / potAfter) * 100 : 0,
        weightTarget: potAfter > EPS ? (perSymbolTarget / potAfter) * 100 : 0,
      });
    }
  }

  buys.sort((a, b) => b.amount - a.amount);

  // ── 4. สัดส่วนหลังลงเงินตามแผน ──
  const addedByGroup = new Map<string, number>();
  for (const b of buys) addedByGroup.set(b.groupKey, (addedByGroup.get(b.groupKey) ?? 0) + b.amount);
  for (const g of planGroups) {
    const after = g.marketValue + (addedByGroup.get(g.key) ?? 0);
    g.actualPctAfter = potAfter > EPS ? (after / potAfter) * 100 : 0;
  }

  const allocatedReal = buys.reduce((a, b) => a + b.amount, 0);

  return {
    currency,
    budget,
    allocated: allocatedReal,
    leftover: budget - allocatedReal,
    buys,
    groups: planGroups.map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      targetPct: g.targetPct,
      actualPctNow: g.actualPctNow,
      actualPctAfter: g.actualPctAfter,
      gap: g.gap,
      allocated: addedByGroup.get(g.key) ?? 0,
    })),
    totals: { marketValueNow, cash, potAfter },
    warnings,
  };
}
