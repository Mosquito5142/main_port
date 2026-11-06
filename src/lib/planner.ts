import 'server-only';
import { hintLabel } from './bands';
import { getPortfolioView, getLevelProximity } from './portfolio';
import type { PortfolioView } from './portfolio';
import { getQuotes } from './yahoo';

/**
 * เครื่องคำนวณ "เดือนนี้มีเงินเท่านี้ ควรเติมตัวไหนเท่าไหร่"
 *
 * ตัวเลขทุกตัวคำนวณจากสูตรตรง ๆ ในไฟล์นี้ ไม่ได้ให้ AI เดา — AI (ถ้าเปิดใช้)
 * มีหน้าที่แค่สรุปเป็นภาษาคน/ทักท้วงจากตัวเลขชุดเดียวกันนี้เท่านั้น
 *
 * หลักการ: กันเงินสดสำรองให้ถึงเป้ากลางก่อน แล้วเติมเฉพาะหมวดที่หลุดใต้กรอบ
 * ไม่ไล่ซื้อตัวที่ติด hint (อย่าเติม / รอดูงบ / อย่าถัวจนกว่าเงินสดเข้าเป้า)
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
  targetLabel?: string;
  actualPctNow: number;
  /** สัดส่วนหลังลงเงินตามแผนนี้ */
  actualPctAfter: number;
  /** เงินที่ยังขาดอยู่เพื่อเข้าขอบกรอบ (ก่อนเติม) */
  gap: number;
  /** เงินที่แผนนี้จัดสรรให้หมวดนี้ */
  allocated: number;
  isCore?: boolean;
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

  const currentBase = view.totals.netWorth > 0 ? view.totals.netWorth : marketValueNow;
  const cashGroup = view.groups.find((g) => g.isOther);
  const cashAim = cashGroup?.targetPct ?? 0;
  // เงินก้อนใหม่ที่ยังไม่ใช้ซื้อ กลายเป็นเงินสด — กันไว้ให้ถึงเป้ากลางก่อน
  const reserveForCash = Math.max(0, Math.min(budget, (cashAim / 100) * potAfter - cash));
  const investBudget = Math.max(0, budget - reserveForCash);
  if (reserveForCash > 1) {
    warnings.push(`กันเงินสดสำรองให้เข้าเป้ากลาง ${cashAim}% ก่อน ส่วนที่เหลือค่อยจัดสรรซื้อ`);
  }

  const stockGroups = view.groups.filter((g) => !g.isOther);
  if (!stockGroups.length) {
    warnings.push('ยังไม่ได้ตั้งสัดส่วนเป้าหมายรายหมวด — ไปตั้งที่หน้ารายละเอียดพอร์ตก่อน');
    return {
      currency, budget, allocated: 0, leftover: budget,
      buys: [], groups: [],
      totals: { marketValueNow, cash, potAfter },
      warnings,
    };
  }

  const posBySymbol = new Map(view.positions.map((p) => [p.symbol, p]));

  type Slot = {
    groupKey: string;
    groupLabel: string;
    symbol: string;
    aimPct: number;
    gap: number;
  };
  const raw: Slot[] = [];
  const blocked = new Set<string>();

  for (const g of stockGroups) {
    const gMv = g.marketValue;
    const gPctAfter = potAfter > EPS ? (gMv / potAfter) * 100 : 0;
    const gMin = g.targetMin;
    const gMax = g.targetMax ?? 100;
    // เติมเฉพาะหมวดที่หลุดใต้กรอบ หมวดที่พอดีหรือเกินจะไม่รับเงินใหม่
    const categoryNeeds =
      gMin != null ? gPctAfter < gMin - 0.2 : gPctAfter < g.targetPct - 0.2;
    if (!categoryNeeds) continue;

    const categoryCapPct = g.targetPct > 0 ? Math.min(g.targetPct, gMax) : gMin ?? 0;
    const categoryRoom = Math.max(0, (categoryCapPct / 100) * potAfter - gMv);
    if (categoryRoom <= EPS) continue;

    const open: Slot[] = [];
    for (const m of g.members) {
      const blockedByHint =
        m.hint === 'no_new' ||
        m.hint === 'wait_earn' ||
        (m.hint === 'no_avg' && reserveForCash > 1);
      const mv = (m.actualPct / 100) * currentBase;
      const min = m.targetMin ?? 0;
      const max = m.targetMax ?? gMax;
      const aim = m.targetPct ?? 0;
      const pctAfter = potAfter > EPS ? (mv / potAfter) * 100 : 0;
      const belowMin = min > 0.2 && pctAfter < min - 0.2;
      const belowAim = aim > 0.2 && pctAfter < aim - 0.2;
      if (!belowMin && !belowAim) continue;
      if (blockedByHint) {
        const label = hintLabel(m.hint);
        if (label) blocked.add(`${m.symbol} ${label}`);
        continue;
      }
      const ceiling = Math.min(max, aim > 0 ? Math.max(aim, min) : min);
      const gap = Math.max(0, (ceiling / 100) * potAfter - mv);
      if (gap > EPS) {
        open.push({ groupKey: g.key, groupLabel: g.label, symbol: m.symbol, aimPct: aim, gap });
      }
    }

    // แผนเก่าที่ยังไม่มีเป้ารายตัว — หารเท่าจากเป้าหมวด
    if (!g.members.length && g.symbols.length && g.targetPct > 0) {
      const each = g.targetPct / g.symbols.length;
      for (const sym of g.symbols) {
        const mv = posBySymbol.get(sym)?.marketValue ?? 0;
        const gap = Math.max(0, (each / 100) * potAfter - mv);
        if (gap > EPS) {
          open.push({ groupKey: g.key, groupLabel: g.label, symbol: sym, aimPct: each, gap });
        }
      }
    }

    const gapSum = open.reduce((a, s) => a + s.gap, 0);
    const fit = gapSum > categoryRoom && gapSum > EPS ? categoryRoom / gapSum : 1;
    for (const s of open) raw.push({ ...s, gap: s.gap * fit });
  }

  if (blocked.size) warnings.push(`ไม่ใส่เงินใหม่: ${[...blocked].join(' · ')}`);

  const totalGap = raw.reduce((a, s) => a + s.gap, 0);
  const spendScale = totalGap > EPS ? Math.min(1, investBudget / totalGap) : 0;
  const slots = raw
    .map((s) => ({ ...s, amount: s.gap * spendScale }))
    .filter((s) => s.amount > EPS);

  if (!slots.length && reserveForCash <= 1 && blocked.size === 0) {
    warnings.push('ทุกหมวดอยู่ในกรอบแล้ว — ไม่มีตัวที่ต้องใช้เงินใหม่เพื่อเข้ากรอบ');
  }

  // หุ้นที่ยังไม่เคยซื้อจะไม่มีราคาใน positions — ดึงราคาสดมาเอง
  const missingPrice = [
    ...new Set(slots.map((s) => s.symbol).filter((s) => !(posBySymbol.get(s)?.price ?? 0))),
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
  for (const s of slots) {
    const pos = posBySymbol.get(s.symbol);
    const quoted = extraQuotes.get(s.symbol)?.price ?? null;
    const price = pos?.price ?? quoted ?? null;
    if (!price || price <= 0) {
      warnings.push(`${s.symbol}: ดึงราคาล่าสุดไม่ได้ เลยคำนวณจำนวนหุ้นไม่ได้ (ข้ามตัวนี้)`);
      continue;
    }

    const heldQty = pos?.quantity ?? 0;
    const avg = pos && heldQty > EPS ? pos.avgCost : null;
    const qty = s.amount / price;
    const oldCost = avg !== null ? avg * heldQty : 0;
    const newQty = heldQty + qty;
    const newCostValue = oldCost + s.amount;
    const newAvg = newQty > EPS ? newCostValue / newQty : price;
    const below = (supportsBySymbol.get(s.symbol) ?? [])
      .filter((p) => p < price)
      .sort((a, b) => b - a);
    const nearestSupport = below[0] ?? null;

    buys.push({
      symbol: s.symbol,
      name: pos?.name ?? extraQuotes.get(s.symbol)?.shortName ?? null,
      groupKey: s.groupKey,
      groupLabel: s.groupLabel,
      amount: s.amount,
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
      weightNow: potAfter > EPS ? ((pos?.marketValue ?? 0) / potAfter) * 100 : 0,
      weightTarget: s.aimPct,
    });
  }

  buys.sort((a, b) => b.amount - a.amount);

  const addedByGroup = new Map<string, number>();
  for (const b of buys) addedByGroup.set(b.groupKey, (addedByGroup.get(b.groupKey) ?? 0) + b.amount);
  const allocatedReal = buys.reduce((a, b) => a + b.amount, 0);
  const unspent = budget - allocatedReal;

  return {
    currency,
    budget,
    allocated: allocatedReal,
    leftover: unspent,
    buys,
    groups: view.groups.map((g) => {
      const added = g.isOther ? 0 : addedByGroup.get(g.key) ?? 0;
      // เงินที่ไม่ได้ใช้ซื้อ คงอยู่ในหมวดเงินสด
      const afterValue = g.isOther ? g.marketValue + unspent : g.marketValue + added;
      return {
        key: g.key,
        label: g.label,
        color: g.color,
        targetPct: g.targetPct,
        targetLabel: g.bandLabel,
        actualPctNow: g.actualPct,
        actualPctAfter: potAfter > EPS ? (afterValue / potAfter) * 100 : 0,
        gap: (g.targetPct / 100) * potAfter - g.marketValue,
        allocated: added,
        isCore: g.isCore,
      };
    }),
    totals: { marketValueNow, cash, potAfter },
    warnings,
  };
}
