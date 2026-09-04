import 'server-only';
import { query, one } from './db';
import { getQuotes, fetchChart } from './yahoo';
import {
  applyTrade,
  avgCost,
  buildLots,
  computeTradeStats,
  emptyLot,
  levelStatus,
  QTY_EPSILON,
  rebalanceAmount,
  type TradeStats,
} from './calc';
import {
  indexGroups,
  listTargetGroups,
  OTHER_KEY,
  targetPctOfSymbol,
  type GroupIndex,
  type TargetGroup,
} from './targetGroups';
import type {
  Level,
  LevelProximity,
  Portfolio,
  Position,
  Stock,
  Trade,
} from './types';

// ---------------------------------------------------------------
// พอร์ต
// ---------------------------------------------------------------
export function listPortfolios(includeArchived = false) {
  return query<Portfolio>(
    `SELECT * FROM gp_portfolios ${includeArchived ? '' : 'WHERE is_archived = 0'}
     ORDER BY (kind = 'main') DESC, id ASC`
  );
}

export function getPortfolio(id: number) {
  return one<Portfolio>(`SELECT * FROM gp_portfolios WHERE id = $1`, [id]);
}

export async function getMainPortfolio() {
  return (
    (await one<Portfolio>(
      `SELECT * FROM gp_portfolios WHERE kind = 'main' AND is_archived = 0 ORDER BY id LIMIT 1`
    )) ?? (await one<Portfolio>(`SELECT * FROM gp_portfolios ORDER BY id LIMIT 1`))
  );
}

export function listStocks() {
  return query<Stock>(`SELECT * FROM gp_stocks ORDER BY symbol`);
}

export function listTrades(portfolioId?: number, stockId?: number) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (portfolioId) {
    params.push(portfolioId);
    where.push(`t.portfolio_id = $${params.length}`);
  }
  if (stockId) {
    params.push(stockId);
    where.push(`t.stock_id = $${params.length}`);
  }
  return query<Trade>(
    `SELECT t.*, s.symbol, s.name AS stock_name, p.name AS portfolio_name
       FROM gp_trades t
       JOIN gp_stocks s ON s.id = t.stock_id
       JOIN gp_portfolios p ON p.id = t.portfolio_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.traded_at DESC, t.id DESC`,
    params
  );
}

// ---------------------------------------------------------------
// ตำแหน่งถือครอง + สัดส่วนเป้าหมาย
// ---------------------------------------------------------------
/** สรุปสัดส่วนจริงเทียบเป้าหมาย รายหมวด */
export interface GroupAllocation {
  key: string;
  label: string;
  color: string;
  targetPct: number;
  actualPct: number;
  diffPct: number;
  marketValue: number;
  /** เงินที่ต้องเติม(+)/ลด(-) เพื่อเข้าเป้า */
  actionAmount: number;
  symbols: string[];
  /** หุ้นที่ถืออยู่จริงในหมวดนี้ */
  heldSymbols: string[];
  isOther: boolean;
}

export interface PortfolioView {
  portfolio: Portfolio;
  /** ที่ยังถืออยู่ หรือมีเป้าหมายตั้งไว้ */
  positions: Position[];
  /** ขายหมดแล้ว — เก็บไว้ดูกำไรที่รับรู้ */
  closed: Position[];
  totals: {
    marketValue: number;
    costValue: number;
    unrealizedPnl: number;
    unrealizedPct: number;
    realizedPnl: number;
    cash: number;
    capitalBase: number;
    netWorth: number;
    totalReturnPct: number;
    dayChange: number;
    targetSum: number;
    /**
     * ROI เทียบกับ "เงินลงทุนสุทธิ" (ต้นทุนของหุ้นที่ยังถืออยู่ตอนนี้ = costValue)
     * = (realizedPnl + unrealizedPnl) / costValue — สูตรเดียวกับที่แดชบอร์ดเทรดทั่วไปใช้
     * ต่างจาก totalReturnPct ที่เทียบกับ "เงินตั้งต้น" (capitalBase) ทั้งสองค่าถูกต้องแต่ตอบคำถามคนละอย่าง
     */
    investedRoi: number;
  };
  /** สัดส่วนรายหมวดตามแผน (คิดรวมเงินสดไว้ในหมวด "อื่นๆ") */
  groups: GroupAllocation[];
  /** อัตราชนะ/แพ้ นับต่อไม้ขาย (ไม่ใช่ต่อสัญลักษณ์) */
  tradeStats: TradeStats;
  stale: boolean;
}

export async function getPortfolioView(portfolioId: number): Promise<PortfolioView | null> {
  // สาม query นี้ไม่ขึ้นต่อกัน — ยิงขนานกันไปเลย
  // (Turso อยู่ไกล ~100-500ms ต่อรอบ การรอต่อคิวทำให้หน้าโหลดช้าโดยไม่จำเป็น)
  const [portfolio, trades, groupList] = await Promise.all([
    getPortfolio(portfolioId),
    query<Trade>(
      `SELECT t.*, s.symbol, s.name AS stock_name
         FROM gp_trades t JOIN gp_stocks s ON s.id = t.stock_id
        WHERE t.portfolio_id = $1
        ORDER BY t.traded_at ASC, t.id ASC`,
      [portfolioId]
    ),
    listTargetGroups(portfolioId),
  ]);
  if (!portfolio) return null;

  // สัดส่วนเป้าหมายรายหมวด (source of truth) -> แตกเป็นเป้าหมายรายตัว
  const gidx = indexGroups(groupList);

  // หุ้นที่เกี่ยวข้องดึงมาจาก trades ที่ JOIN มาแล้ว ไม่ต้อง query ซ้ำอีกรอบ
  const stockMap = new Map<number, Pick<Stock, 'id' | 'symbol' | 'name'>>();
  for (const t of trades) {
    if (!stockMap.has(t.stock_id)) {
      stockMap.set(t.stock_id, {
        id: t.stock_id,
        symbol: t.symbol!,
        name: t.stock_name ?? null,
      });
    }
  }
  const stockIds = new Set<number>(stockMap.keys());
  const stocks = [...stockMap.values()];

  const lots = buildLots(trades);
  const quotes = await getQuotes(stocks.map((s) => s.symbol));
  const stale = [...quotes.values()].some((q) => q.stale);

  let marketValue = 0;
  let costValue = 0;
  let realizedPnl = 0;
  let buyAmount = 0;
  let sellAmount = 0;
  let dayChange = 0;

  const rows = [...stockIds].map((id) => {
    const stock = stockMap.get(id)!;
    const lot = lots.get(id) ?? emptyLot();
    const quote = quotes.get(stock.symbol.toUpperCase());
    const price = quote?.price ?? null;
    const mv = price !== null ? lot.quantity * price : lot.costValue;

    marketValue += mv;
    costValue += lot.costValue;
    realizedPnl += lot.realizedPnl;
    buyAmount += lot.buyAmount;
    sellAmount += lot.sellAmount;
    if (price !== null && quote?.previousClose)
      dayChange += lot.quantity * (price - quote.previousClose);

    return { stock, lot, quote, price, mv };
  });

  const allPositions: Position[] = rows
    .map(({ stock, lot, quote, price, mv }) => {
      // เป้าหมายมาจาก "หมวด" เท่านั้น — หุ้นที่ไม่อยู่หมวดไหนถือเป็น "อื่นๆ" (ไม่มีเป้ารายตัว)
      const target = targetPctOfSymbol(gidx, stock.symbol);
      const weight = marketValue > 0 ? (mv / marketValue) * 100 : 0;
      return {
        stock_id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        quantity: lot.quantity,
        avgCost: avgCost(lot),
        costValue: lot.costValue,
        realizedPnl: lot.realizedPnl,
        price,
        marketValue: mv,
        unrealizedPnl: mv - lot.costValue,
        unrealizedPct: lot.costValue > 0 ? ((mv - lot.costValue) / lot.costValue) * 100 : null,
        weight,
        targetPercent: target,
        diffPercent: target === null ? null : weight - target,
        actionAmount: target === null ? 0 : rebalanceAmount(mv, marketValue, target),
        changePercent: quote?.changePercent ?? null,
      } satisfies Position;
    })
    .sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));

  // หุ้นที่ "เคยมีการซื้อจริง" — ใช้แยกของที่ขายหมดแล้ว ออกจากของที่ตั้งเป้าไว้เฉย ๆ แต่ยังไม่เคยซื้อ
  const everBought = new Set(
    rows.filter(({ lot }) => lot.buyAmount > 0).map(({ stock }) => stock.id)
  );

  // ถืออยู่จริงเท่านั้นถึงจะขึ้นตารางพอร์ต — เดิมเช็ก targetPercent !== null ด้วย
  // ทำให้หุ้นที่ขายหมดแล้วแต่ยังอยู่ในหมวดเป้าหมาย (เช่น SOFI) ค้างอยู่ในตารางทั้งที่ถือ 0 หุ้น
  // ส่วน "ตัวที่ควรซื้อเพิ่ม" ดูได้ที่หน้าวางแผนลงเงิน + ตัวแก้สัดส่วนรายหมวดอยู่แล้ว
  const isHeld = (p: Position) => p.quantity > QTY_EPSILON;
  const positions = allPositions.filter(isHeld);
  const closed = allPositions
    .filter((p) => !isHeld(p) && everBought.has(p.stock_id))
    .sort((a, b) => b.realizedPnl - a.realizedPnl);

  const capitalBase =
    Number(portfolio.initial_cash) > 0 ? Number(portfolio.initial_cash) : buyAmount;
  const cash = capitalBase - buyAmount + sellAmount;
  const netWorth = cash + marketValue;
  const unrealizedPnl = marketValue - costValue;

  // ---- สรุปรายหมวด ----
  // ตัวหารคือมูลค่าพอร์ตรวมเงินสด เพราะเงินสดถูกนับเป็นส่วนหนึ่งของหมวด "อื่นๆ"
  const base = netWorth > 0 ? netWorth : marketValue;
  const valueByGroup = new Map<string, number>();
  const heldByGroup = new Map<string, string[]>();
  for (const p of allPositions) {
    if (p.marketValue <= 0) continue;
    const key = gidx.symbolToGroup.get(p.symbol.toUpperCase()) ?? OTHER_KEY;
    valueByGroup.set(key, (valueByGroup.get(key) ?? 0) + p.marketValue);
    const held = heldByGroup.get(key) ?? [];
    held.push(p.symbol);
    heldByGroup.set(key, held);
  }
  // เงินสดไปกองรวมที่หมวดอื่นๆ
  if (cash > 0) valueByGroup.set(OTHER_KEY, (valueByGroup.get(OTHER_KEY) ?? 0) + cash);

  const groups: GroupAllocation[] = groupList.map((g) => {
    const mv = valueByGroup.get(g.key) ?? 0;
    const actualPct = base > 0 ? (mv / base) * 100 : 0;
    return {
      key: g.key,
      label: g.label,
      color: g.color,
      targetPct: g.targetPct,
      actualPct,
      diffPct: actualPct - g.targetPct,
      marketValue: mv,
      actionAmount: (g.targetPct / 100) * base - mv,
      symbols: g.symbols,
      heldSymbols: heldByGroup.get(g.key) ?? [],
      isOther: g.isOther,
    };
  });

  return {
    portfolio,
    positions,
    closed,
    totals: {
      marketValue,
      costValue,
      unrealizedPnl,
      unrealizedPct: costValue > 0 ? (unrealizedPnl / costValue) * 100 : 0,
      realizedPnl,
      cash,
      capitalBase,
      netWorth,
      totalReturnPct: capitalBase > 0 ? (netWorth / capitalBase - 1) * 100 : 0,
      dayChange,
      targetSum: groupList.reduce((a, g) => a + g.targetPct, 0),
      investedRoi: costValue > 0 ? ((realizedPnl + unrealizedPnl) / costValue) * 100 : 0,
    },
    groups,
    tradeStats: computeTradeStats(trades),
    stale,
  };
}

/**
 * แปลงตัวเลขเงินทั้งหมดใน view เป็นอีกสกุลหนึ่ง (สำหรับโหมด "ดูเป็นเงินบาท")
 * เปอร์เซ็นต์และจำนวนหุ้นไม่ต้องแตะ เพราะเป็นอัตราส่วน
 */
export function applyFx(view: PortfolioView, fx: { code: string; rate: number }): PortfolioView {
  if (fx.rate === 1) return view;
  const c = (n: number) => n * fx.rate;
  const conv = (p: Position): Position => ({
    ...p,
    avgCost: c(p.avgCost),
    costValue: c(p.costValue),
    realizedPnl: c(p.realizedPnl),
    price: p.price === null ? null : c(p.price),
    marketValue: c(p.marketValue),
    unrealizedPnl: c(p.unrealizedPnl),
    actionAmount: c(p.actionAmount),
  });

  return {
    ...view,
    portfolio: { ...view.portfolio, currency: fx.code, initial_cash: c(view.portfolio.initial_cash) },
    positions: view.positions.map(conv),
    closed: view.closed.map(conv),
    // เปอร์เซ็นต์ไม่ต้องแตะ แปลงเฉพาะจำนวนเงิน
    groups: view.groups.map((g) => ({
      ...g,
      marketValue: c(g.marketValue),
      actionAmount: c(g.actionAmount),
    })),
    totals: {
      ...view.totals,
      marketValue: c(view.totals.marketValue),
      costValue: c(view.totals.costValue),
      unrealizedPnl: c(view.totals.unrealizedPnl),
      realizedPnl: c(view.totals.realizedPnl),
      cash: c(view.totals.cash),
      capitalBase: c(view.totals.capitalBase),
      netWorth: c(view.totals.netWorth),
      dayChange: c(view.totals.dayChange),
    },
  };
}

// ---------------------------------------------------------------
// แนวรับ / แนวต้าน
// ---------------------------------------------------------------
export async function getLevelProximity(activeOnly = true): Promise<LevelProximity[]> {
  const levels = await query<Level & { name: string | null }>(
    `SELECT l.*, s.symbol, s.name
       FROM gp_levels l JOIN gp_stocks s ON s.id = l.stock_id
      ${activeOnly ? 'WHERE l.is_active = 1' : ''}
      ORDER BY s.symbol, l.price DESC`
  );
  if (!levels.length) return [];

  const quotes = await getQuotes(levels.map((l) => l.symbol!));

  return levels
    .map((l) => {
      const q = quotes.get(l.symbol!.toUpperCase());
      const current = q?.price ?? null;
      const distance = current !== null ? current - Number(l.price) : null;
      const distancePct =
        current !== null && Number(l.price) > 0
          ? ((current - Number(l.price)) / Number(l.price)) * 100
          : null;
      return {
        level_id: l.id,
        stock_id: l.stock_id,
        symbol: l.symbol!,
        name: l.name,
        kind: l.kind,
        price: Number(l.price),
        label: l.label,
        priority: l.priority,
        currentPrice: current,
        distance,
        distancePct,
        status: levelStatus(distancePct),
        source: l.source,
      } satisfies LevelProximity;
    })
    .sort((a, b) => {
      const da = a.distancePct === null ? Infinity : Math.abs(a.distancePct);
      const db = b.distancePct === null ? Infinity : Math.abs(b.distancePct);
      return da - db || a.priority - b.priority;
    });
}

// ---------------------------------------------------------------
// เปรียบเทียบพอร์ต (equity curve)
// ---------------------------------------------------------------
export interface CurvePoint {
  date: string;
  [key: string]: string | number | null;
}

export interface CompareResult {
  points: CurvePoint[];
  series: {
    id: number;
    key: string;
    name: string;
    color: string;
    kind: string;
    capitalBase: number;
    finalValue: number;
    returnPct: number;
    maxDrawdown: number;
    best: boolean;
  }[];
  warnings: string[];
}

export async function comparePortfolios(
  portfolioIds: number[],
  range = '1y'
): Promise<CompareResult> {
  const warnings: string[] = [];
  if (!portfolioIds.length) return { points: [], series: [], warnings };

  const portfolios = await query<Portfolio>(
    `SELECT * FROM gp_portfolios WHERE id IN (${portfolioIds.map(() => '?').join(',')}) ORDER BY (kind='main') DESC, id`,
    portfolioIds
  );
  const trades = await query<Trade>(
    `SELECT t.*, s.symbol FROM gp_trades t JOIN gp_stocks s ON s.id = t.stock_id
      WHERE t.portfolio_id IN (${portfolioIds.map(() => '?').join(',')})
      ORDER BY t.traded_at ASC, t.id ASC`,
    portfolioIds
  );
  if (!trades.length) return { points: [], series: [], warnings: ['ยังไม่มีรายการซื้อขาย'] };

  const symbols = [...new Set(trades.map((t) => t.symbol!.toUpperCase()))];
  const closes = new Map<string, { dates: string[]; map: Map<string, number> }>();

  // ดึงกราฟทุกตัวขนานกัน (เดิมวนทีละตัวแบบรอต่อคิว ทำให้ 14 ตัวใช้เวลา ~3 วินาที)
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const chart = await fetchChart(sym, range, '1d');
        const map = new Map<string, number>();
        for (const c of chart.candles) if (c.close !== null) map.set(c.date, c.close);
        closes.set(sym, { dates: [...map.keys()].sort(), map });
      } catch {
        warnings.push(`ดึงราคาย้อนหลังของ ${sym} ไม่ได้ — ใช้ราคาต้นทุนแทน`);
        closes.set(sym, { dates: [], map: new Map() });
      }
    })
  );

  const firstTrade = trades[0].traded_at.slice(0, 10);
  const allDates = new Set<string>();
  for (const { dates } of closes.values())
    for (const d of dates) if (d >= firstTrade) allDates.add(d);
  const today = new Date().toISOString().slice(0, 10);
  allDates.add(today);
  const timeline = [...allDates].sort();
  if (!timeline.length) return { points: [], series: [], warnings: ['ไม่มีข้อมูลราคาย้อนหลัง'] };

  // ราคา ณ วันที่ (forward fill)
  const priceAt = (sym: string, date: string, fallback: number): number => {
    const entry = closes.get(sym);
    if (!entry || !entry.dates.length) return fallback;
    if (entry.map.has(date)) return entry.map.get(date)!;
    let lo = 0;
    let hi = entry.dates.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (entry.dates[mid] <= date) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best >= 0 ? entry.map.get(entry.dates[best])! : fallback;
  };

  const points: CurvePoint[] = timeline.map((d) => ({ date: d }));
  const series: CompareResult['series'] = [];

  for (const p of portfolios) {
    const key = `p${p.id}`;
    const pTrades = trades.filter((t) => t.portfolio_id === p.id);
    const totalBuy = pTrades
      .filter((t) => t.side === 'buy')
      .reduce((a, t) => a + Number(t.quantity) * Number(t.price) + Number(t.fee ?? 0), 0);
    const capitalBase = Number(p.initial_cash) > 0 ? Number(p.initial_cash) : totalBuy;

    let ti = 0;
    let cash = capitalBase;
    const lots = new Map<string, ReturnType<typeof emptyLot>>();
    const lastCost = new Map<string, number>();
    let peak = -Infinity;
    let maxDrawdown = 0;
    let finalValue = capitalBase;

    timeline.forEach((date, idx) => {
      while (ti < pTrades.length && pTrades[ti].traded_at.slice(0, 10) <= date) {
        const t = pTrades[ti];
        const sym = t.symbol!.toUpperCase();
        const lot = lots.get(sym) ?? emptyLot();
        const next = applyTrade(lot, t);
        lots.set(sym, next);
        lastCost.set(sym, Number(t.price));
        cash +=
          t.side === 'buy'
            ? -(Number(t.quantity) * Number(t.price) + Number(t.fee ?? 0))
            : Number(t.quantity) * Number(t.price) - Number(t.fee ?? 0);
        ti++;
      }

      let holdings = 0;
      for (const [sym, lot] of lots) {
        if (lot.quantity <= 0) continue;
        holdings += lot.quantity * priceAt(sym, date, lastCost.get(sym) ?? 0);
      }
      const value = cash + holdings;
      finalValue = value;
      peak = Math.max(peak, value);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (value / peak - 1) * 100);

      points[idx][key] = Number(value.toFixed(2));
      points[idx][`${key}_pct`] =
        capitalBase > 0 ? Number(((value / capitalBase - 1) * 100).toFixed(3)) : 0;
    });

    series.push({
      id: p.id,
      key,
      name: p.name,
      color: p.color,
      kind: p.kind,
      capitalBase,
      finalValue,
      returnPct: capitalBase > 0 ? (finalValue / capitalBase - 1) * 100 : 0,
      maxDrawdown,
      best: false,
    });
  }

  if (series.length) {
    const bestId = series.reduce((a, b) => (b.returnPct > a.returnPct ? b : a)).id;
    for (const s of series) s.best = s.id === bestId;
  }

  return { points, series, warnings };
}

// ---------------------------------------------------------------
// กราฟการเคลื่อนไหวของพอร์ตเดียว + จุดที่เคยไปแตะ
// ---------------------------------------------------------------
export interface HistoryMarker {
  date: string;
  value: number;
  pct: number;
}

export interface PortfolioHistory {
  points: { date: string; value: number; pct: number }[];
  capitalBase: number;
  currency: string;
  /** จุดสูงสุดที่พอร์ตเคยไปแตะในช่วงนี้ */
  peak: HistoryMarker | null;
  /** จุดต่ำสุด */
  trough: HistoryMarker | null;
  current: HistoryMarker | null;
  /** วันที่ทำจุดสูงสุด แล้วย่อลงมามากที่สุดกี่ % */
  maxDrawdown: number;
  /** วันที่มูลค่าขยับแรงที่สุด (บวก/ลบ) ไว้ดูว่าช่วงไหนพอร์ตสวิงแรง */
  biggestGainDay: { date: string; change: number; pct: number } | null;
  biggestDropDay: { date: string; change: number; pct: number } | null;
  warnings: string[];
}

export async function getPortfolioHistory(
  portfolioId: number,
  range = '1y',
  fx: { code: string; rate: number } = { code: '', rate: 1 }
): Promise<PortfolioHistory> {
  const cmp = await comparePortfolios([portfolioId], range);
  const s = cmp.series[0];

  const empty: PortfolioHistory = {
    points: [],
    capitalBase: 0,
    currency: fx.code,
    peak: null,
    trough: null,
    current: null,
    maxDrawdown: 0,
    biggestGainDay: null,
    biggestDropDay: null,
    warnings: cmp.warnings,
  };
  if (!s) return empty;

  const key = s.key;
  const points = cmp.points
    .map((p) => ({
      date: p.date,
      value: Number(p[key] ?? 0) * fx.rate,
      pct: Number(p[`${key}_pct`] ?? 0),
    }))
    .filter((p) => Number.isFinite(p.value));

  if (!points.length) return empty;

  let peak = points[0];
  let trough = points[0];
  for (const p of points) {
    if (p.value > peak.value) peak = p;
    if (p.value < trough.value) trough = p;
  }

  // หาวันที่ขยับแรงสุด (เทียบกับวันก่อนหน้า)
  let biggestGainDay: PortfolioHistory['biggestGainDay'] = null;
  let biggestDropDay: PortfolioHistory['biggestDropDay'] = null;
  for (let i = 1; i < points.length; i++) {
    const change = points[i].value - points[i - 1].value;
    const pct = points[i - 1].value > 0 ? (change / points[i - 1].value) * 100 : 0;
    const entry = { date: points[i].date, change, pct };
    if (!biggestGainDay || change > biggestGainDay.change) biggestGainDay = entry;
    if (!biggestDropDay || change < biggestDropDay.change) biggestDropDay = entry;
  }

  return {
    points,
    capitalBase: s.capitalBase * fx.rate,
    currency: fx.code,
    peak,
    trough,
    current: points[points.length - 1],
    maxDrawdown: s.maxDrawdown,
    biggestGainDay: biggestGainDay && biggestGainDay.change > 0 ? biggestGainDay : null,
    biggestDropDay: biggestDropDay && biggestDropDay.change < 0 ? biggestDropDay : null,
    warnings: cmp.warnings,
  };
}
