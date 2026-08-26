// ฟังก์ชันคำนวณล้วน ๆ (ใช้ได้ทั้งฝั่ง server และ client)
import type { LevelKind, Trade } from './types';

/** ต่ำกว่านี้ถือว่าไม่มีของเหลือแล้ว (กันเศษ floating point จากหุ้นเศษส่วน) */
export const QTY_EPSILON = 1e-9;

export interface Lot {
  quantity: number;
  costValue: number; // ต้นทุนรวม (รวมค่าธรรมเนียมฝั่งซื้อ)
  realizedPnl: number;
  buyAmount: number; // เงินที่จ่ายซื้อสะสม
  sellAmount: number; // เงินที่ได้จากการขายสะสม
}

export function emptyLot(): Lot {
  return { quantity: 0, costValue: 0, realizedPnl: 0, buyAmount: 0, sellAmount: 0 };
}

/** เดินรายการซื้อขายแบบต้นทุนถัวเฉลี่ย (average cost) */
export function applyTrade(lot: Lot, t: Pick<Trade, 'side' | 'quantity' | 'price' | 'fee'>): Lot {
  const qty = Number(t.quantity);
  const price = Number(t.price);
  const fee = Number(t.fee ?? 0);

  if (t.side === 'buy') {
    const gross = qty * price + fee;
    return {
      quantity: lot.quantity + qty,
      costValue: lot.costValue + gross,
      realizedPnl: lot.realizedPnl,
      buyAmount: lot.buyAmount + gross,
      sellAmount: lot.sellAmount,
    };
  }

  const avg = lot.quantity > 0 ? lot.costValue / lot.quantity : 0;
  const sellQty = Math.min(qty, lot.quantity);
  const proceeds = qty * price - fee;
  const costOut = avg * sellQty;
  // ปัดเศษ floating point ทิ้ง ไม่งั้นไม้ที่ขายหมดแล้วจะเหลือ 2.2e-16 หุ้นค้างอยู่
  const raw = lot.quantity - qty;
  const remainQty = raw < QTY_EPSILON ? 0 : raw;
  return {
    quantity: remainQty,
    costValue: remainQty === 0 ? 0 : lot.costValue - costOut,
    realizedPnl: lot.realizedPnl + (proceeds - costOut),
    buyAmount: lot.buyAmount,
    sellAmount: lot.sellAmount + proceeds,
  };
}

export interface TradeStats {
  /** จำนวนไม้ขายทั้งหมด (นับต่อรายการขาย ไม่ใช่ต่อสัญลักษณ์ — ขายบางส่วนหลายครั้งของตัวเดียวกันนับแยกกัน) */
  totalClosedTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

/** อัตราชนะ/แพ้ นับจาก "กำไรของไม้ขายแต่ละครั้ง" (เหมือนที่แดชบอร์ดเทรดทั่วไปนับ) */
export function computeTradeStats<
  T extends Pick<Trade, 'stock_id' | 'side' | 'quantity' | 'price' | 'fee' | 'traded_at'> & {
    id?: number;
  },
>(trades: T[]): TradeStats {
  const sorted = [...trades].sort(
    (a, b) =>
      String(a.traded_at).localeCompare(String(b.traded_at)) ||
      (a.id ?? 0) - (b.id ?? 0)
  );
  const lots = new Map<number, Lot>();
  let wins = 0;
  let losses = 0;
  for (const t of sorted) {
    const lot = lots.get(t.stock_id) ?? emptyLot();
    const next = applyTrade(lot, t);
    if (t.side === 'sell') {
      const delta = next.realizedPnl - lot.realizedPnl;
      if (delta > 1e-6) wins++;
      else if (delta < -1e-6) losses++;
    }
    lots.set(t.stock_id, next);
  }
  const total = wins + losses;
  return {
    totalClosedTrades: total,
    wins,
    losses,
    winRate: total > 0 ? (wins / total) * 100 : null,
  };
}

export function buildLots<
  T extends Pick<Trade, 'stock_id' | 'side' | 'quantity' | 'price' | 'fee' | 'traded_at'> & {
    id?: number;
  },
>(trades: T[]): Map<number, Lot> {
  // เรียงด้วย (วันที่, id) เสมอ — ไม่งั้นคู่ซื้อ-ขายที่เกิดวันเดียวกันจะสลับลำดับ
  // ตามลำดับที่ผู้เรียกส่งเข้ามา (บางหน้าส่งมาแบบใหม่สุดก่อน) แล้วยอดคงเหลือจะเพี้ยน
  const sorted = [...trades].sort(
    (a, b) =>
      String(a.traded_at).localeCompare(String(b.traded_at)) ||
      (a.id ?? 0) - (b.id ?? 0)
  );
  const map = new Map<number, Lot>();
  for (const t of sorted) {
    const lot = map.get(t.stock_id) ?? emptyLot();
    map.set(t.stock_id, applyTrade(lot, t));
  }
  return map;
}

export function avgCost(lot: Lot): number {
  return lot.quantity > 0 ? lot.costValue / lot.quantity : 0;
}

// ---------------------------------------------------------------
// เครื่องคำนวณ "ถ้าซื้อเพิ่มเท่านี้ ค่าเฉลี่ยจะเป็นเท่าไหร่"
// ---------------------------------------------------------------
export interface AverageSimInput {
  currentQty: number;
  currentAvg: number;
  addQty: number;
  addPrice: number;
  fee?: number;
  portfolioValueExcl?: number; // มูลค่าหุ้นตัวอื่นในพอร์ต (ใช้คำนวณสัดส่วน)
  marketPrice?: number | null; // ราคาตลาดปัจจุบัน (ถ้าไม่ใส่จะใช้ addPrice)
}

export interface AverageSimResult {
  newQty: number;
  newCost: number;
  newAvg: number;
  addCost: number;
  avgChange: number;
  avgChangePct: number;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  weightBefore: number;
  weightAfter: number;
  breakEven: number;
}

export function simulateAverage(i: AverageSimInput): AverageSimResult {
  const fee = i.fee ?? 0;
  const currentCost = i.currentQty * i.currentAvg;
  const addCost = i.addQty * i.addPrice + fee;
  const newQty = i.currentQty + i.addQty;
  const newCost = currentCost + addCost;
  const newAvg = newQty > 0 ? newCost / newQty : 0;
  const mkt = i.marketPrice ?? i.addPrice;
  const marketValue = newQty * mkt;
  const others = i.portfolioValueExcl ?? 0;
  const beforeValue = i.currentQty * mkt;

  return {
    newQty,
    newCost,
    newAvg,
    addCost,
    avgChange: newAvg - i.currentAvg,
    avgChangePct: i.currentAvg > 0 ? ((newAvg - i.currentAvg) / i.currentAvg) * 100 : 0,
    marketValue,
    unrealized: marketValue - newCost,
    unrealizedPct: newCost > 0 ? ((marketValue - newCost) / newCost) * 100 : 0,
    weightBefore: others + beforeValue > 0 ? (beforeValue / (others + beforeValue)) * 100 : 0,
    weightAfter: others + marketValue > 0 ? (marketValue / (others + marketValue)) * 100 : 0,
    breakEven: newAvg,
  };
}

/** ต้องซื้อกี่หุ้นที่ราคานี้ เพื่อดึงต้นทุนเฉลี่ยลงมาที่ targetAvg */
export function qtyToReachAverage(
  currentQty: number,
  currentAvg: number,
  price: number,
  targetAvg: number
): number | null {
  const denom = targetAvg - price;
  if (denom === 0) return null;
  const qty = (currentQty * (currentAvg - targetAvg)) / denom;
  return qty > 0 && Number.isFinite(qty) ? qty : null;
}

// ---------------------------------------------------------------
// แนวรับ / แนวต้าน
// ---------------------------------------------------------------
export type LevelStatus = 'hit' | 'near' | 'watch' | 'far' | 'unknown';

export function levelStatus(distancePct: number | null): LevelStatus {
  if (distancePct === null || Number.isNaN(distancePct)) return 'unknown';
  const d = Math.abs(distancePct);
  if (d <= 1) return 'hit';
  if (d <= 3) return 'near';
  if (d <= 7) return 'watch';
  return 'far';
}

export const LEVEL_STATUS_LABEL: Record<LevelStatus, string> = {
  hit: 'ถึงแล้ว',
  near: 'ใกล้มาก',
  watch: 'เฝ้าดู',
  far: 'ยังไกล',
  unknown: 'ไม่มีราคา',
};

export function levelKindLabel(k: LevelKind): string {
  return k === 'support' ? 'แนวรับ' : 'แนวต้าน';
}

// ---------------------------------------------------------------
// การจัดสัดส่วนเป้าหมาย
// ---------------------------------------------------------------
/** เงินที่ต้องซื้อ(+)/ขาย(-) เพื่อให้ weight เท่าเป้า โดยคงมูลค่ารวมเดิม */
export function rebalanceAmount(
  marketValue: number,
  totalValue: number,
  targetPercent: number
): number {
  if (totalValue <= 0) return 0;
  return (targetPercent / 100) * totalValue - marketValue;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
