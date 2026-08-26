export type PortfolioKind = 'main' | 'plan';
export type TradeSide = 'buy' | 'sell';
export type LevelKind = 'support' | 'resistance';

export interface Portfolio {
  id: number;
  name: string;
  kind: PortfolioKind;
  description: string | null;
  currency: string;
  initial_cash: number;
  color: string;
  is_archived: boolean;
  created_at: string;
}

export interface Stock {
  id: number;
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  note: string | null;
}

export interface Trade {
  id: number;
  portfolio_id: number;
  stock_id: number;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  traded_at: string;
  note: string | null;
  symbol?: string;
  stock_name?: string | null;
  portfolio_name?: string;
}

export interface Level {
  id: number;
  stock_id: number;
  kind: LevelKind;
  price: number;
  label: string | null;
  priority: number;
  is_active: boolean;
  source: string;
  symbol?: string;
}

export interface Quote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  currency: string | null;
  shortName: string | null;
  exchange: string | null;
  changePercent: number | null;
  stale?: boolean;
}

/** ตำแหน่งถือครองที่คำนวณจาก trades แล้ว */
export interface Position {
  stock_id: number;
  symbol: string;
  name: string | null;
  quantity: number;
  avgCost: number;
  costValue: number;
  realizedPnl: number;
  price: number | null;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number | null;
  weight: number; // % ของมูลค่าหุ้นรวม
  targetPercent: number | null;
  diffPercent: number | null; // weight - target
  actionAmount: number; // จำนวนเงินที่ต้องซื้อ(+)/ขาย(-) เพื่อเข้าเป้า
  changePercent: number | null;
}

export interface LevelProximity {
  level_id: number;
  stock_id: number;
  symbol: string;
  name: string | null;
  kind: LevelKind;
  price: number;
  label: string | null;
  priority: number;
  currentPrice: number | null;
  distance: number | null; // ราคาปัจจุบัน - ราคาแนว
  distancePct: number | null; // % ห่างจากแนว (absolute)
  status: 'hit' | 'near' | 'watch' | 'far' | 'unknown';
  /** 'manual' | 'turso' (sync จากเทรดจริง) | 'signal_import' (นำเข้าโพย) */
  source: string;
}
