import 'server-only';
import { query, tx } from './db';

/**
 * สัดส่วนเป้าหมายของพอร์ต แบบ "รายหมวด"
 * เก็บใน DB (gp_target_groups + gp_group_symbols) แก้ได้จากหน้าเว็บทุกเมื่อ
 *
 * เป้าหมายรายตัว = เป้าของหมวด หารเท่า ๆ กันตามจำนวนหุ้นในหมวด
 * เช่น Physical AI 18.75% มี 5 ตัว -> ตัวละ 3.75%
 */

export interface TargetGroup {
  id: number;
  key: string;
  label: string;
  targetPct: number;
  color: string;
  sortOrder: number;
  isOther: boolean;
  symbols: string[];
}

export const OTHER_KEY = 'other';

/** ค่าเริ่มต้นตอนยังไม่เคยตั้ง — อ้างอิงแผน "Growth Portfolio ตามสัดส่วนความมั่นใจ" */
const DEFAULT_GROUPS: Omit<TargetGroup, 'id'>[] = [
  { key: 'meta', label: 'META', targetPct: 25, symbols: ['META'], color: '#1877F2', sortOrder: 0, isOther: false },
  { key: 'physical_ai', label: 'Physical AI', targetPct: 18.75, symbols: ['AMBA', 'AMBQ', 'OSS', 'VPG', 'OUST'], color: '#2563eb', sortOrder: 1, isOther: false },
  { key: 'rklb', label: 'RKLB', targetPct: 11.25, symbols: ['RKLB'], color: '#f97316', sortOrder: 2, isOther: false },
  { key: 'drone', label: 'โดรน (Drone)', targetPct: 7.5, symbols: ['KTOS', 'AVAV', 'ONDS'], color: '#22c55e', sortOrder: 3, isOther: false },
  { key: 'asts', label: 'ASTS', targetPct: 7.5, symbols: ['ASTS'], color: '#a855f7', sortOrder: 4, isOther: false },
  { key: 'crdo', label: 'CRDO', targetPct: 5.25, symbols: ['CRDO'], color: '#06b6d4', sortOrder: 5, isOther: false },
  { key: 'aehr', label: 'AEHR', targetPct: 5.25, symbols: ['AEHR'], color: '#eab308', sortOrder: 6, isOther: false },
  { key: 'crcl', label: 'CRCL', targetPct: 3, symbols: ['CRCL'], color: '#ec4899', sortOrder: 7, isOther: false },
  { key: 'fps', label: 'FPS', targetPct: 3, symbols: ['FPS'], color: '#14b8a6', sortOrder: 8, isOther: false },
  { key: 'nvts', label: 'NVTS', targetPct: 2.25, symbols: ['NVTS'], color: '#fb923c', sortOrder: 9, isOther: false },
  { key: 'tmdx', label: 'TMDX', targetPct: 2.25, symbols: ['TMDX'], color: '#8b5cf6', sortOrder: 10, isOther: false },
  { key: 'clpt', label: 'CLPT', targetPct: 2.25, symbols: ['CLPT'], color: '#4ade80', sortOrder: 11, isOther: false },
  { key: 'oklo', label: 'OKLO', targetPct: 2.25, symbols: ['OKLO'], color: '#ef4444', sortOrder: 12, isOther: false },
  { key: 'jmia', label: 'JMIA', targetPct: 1.5, symbols: ['JMIA'], color: '#94a3b8', sortOrder: 13, isOther: false },
  { key: OTHER_KEY, label: 'อื่นๆ / เงินสด', targetPct: 3, symbols: [], color: '#64748b', sortOrder: 99, isOther: true },
];

/** อ่านหมวดทั้งหมดของพอร์ต — ถ้ายังไม่เคยมี จะใส่ค่าเริ่มต้นให้อัตโนมัติ */
export async function listTargetGroups(portfolioId: number): Promise<TargetGroup[]> {
  let rows = await readGroups(portfolioId);
  if (!rows.length) {
    await saveTargetGroups(portfolioId, DEFAULT_GROUPS);
    rows = await readGroups(portfolioId);
  }
  return rows;
}

async function readGroups(portfolioId: number): Promise<TargetGroup[]> {
  // สอง query นี้ใช้แค่ portfolioId เหมือนกัน ไม่ขึ้นต่อกัน — ยิงขนานได้
  const [groups, syms] = await Promise.all([
    query<{
      id: number; key: string; label: string; target_pct: number;
      color: string; sort_order: number; is_other: number;
    }>(
      `SELECT id, key, label, target_pct, color, sort_order, is_other
         FROM gp_target_groups WHERE portfolio_id = $1
        ORDER BY is_other ASC, sort_order ASC, id ASC`,
      [portfolioId]
    ),
    query<{ group_id: number; symbol: string }>(
      `SELECT gs.group_id, gs.symbol
         FROM gp_group_symbols gs
         JOIN gp_target_groups g ON g.id = gs.group_id
        WHERE g.portfolio_id = $1
        ORDER BY gs.id`,
      [portfolioId]
    ),
  ]);
  if (!groups.length) return [];
  const byGroup = new Map<number, string[]>();
  for (const s of syms) {
    const arr = byGroup.get(s.group_id) ?? [];
    arr.push(s.symbol);
    byGroup.set(s.group_id, arr);
  }

  return groups.map((g) => ({
    id: g.id,
    key: g.key,
    label: g.label,
    targetPct: Number(g.target_pct),
    color: g.color,
    sortOrder: g.sort_order,
    isOther: Boolean(g.is_other),
    symbols: byGroup.get(g.id) ?? [],
  }));
}

/** เขียนทับหมวดทั้งชุด */
export async function saveTargetGroups(
  portfolioId: number,
  groups: Omit<TargetGroup, 'id'>[]
): Promise<void> {
  await tx(async (q) => {
    await q(`DELETE FROM gp_target_groups WHERE portfolio_id = $1`, [portfolioId]);
    let order = 0;
    for (const g of groups) {
      const isOther = g.isOther || g.key === OTHER_KEY;
      const rows = await q<{ id: number }>(
        `INSERT INTO gp_target_groups
           (portfolio_id, key, label, target_pct, color, sort_order, is_other, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, datetime('now')) RETURNING id`,
        [
          portfolioId,
          g.key,
          g.label,
          Number(g.targetPct) || 0,
          g.color || '#66BB6A',
          isOther ? 99 : order++,
          isOther ? 1 : 0,
        ]
      );
      const groupId = rows[0].id;
      const seen = new Set<string>();
      for (const raw of g.symbols ?? []) {
        const sym = String(raw || '').toUpperCase().trim();
        if (!sym || seen.has(sym)) continue;
        seen.add(sym);
        await q(`INSERT INTO gp_group_symbols (group_id, symbol) VALUES ($1,$2)`, [
          groupId,
          sym,
        ]);
      }
    }
  });
}

// ---------------------------------------------------------------
// helper สำหรับคำนวณ (รับ groups ที่โหลดมาแล้ว ไม่ยิง DB ซ้ำ)
// ---------------------------------------------------------------
export interface GroupIndex {
  groups: TargetGroup[];
  /** symbol -> key ของหมวด (ไม่เจอ = อื่นๆ) */
  symbolToGroup: Map<string, string>;
  byKey: Map<string, TargetGroup>;
  totalTargetPct: number;
}

export function indexGroups(groups: TargetGroup[]): GroupIndex {
  const symbolToGroup = new Map<string, string>();
  const byKey = new Map<string, TargetGroup>();
  for (const g of groups) {
    byKey.set(g.key, g);
    for (const s of g.symbols) symbolToGroup.set(s.toUpperCase(), g.key);
  }
  return {
    groups,
    symbolToGroup,
    byKey,
    totalTargetPct: groups.reduce((a, g) => a + g.targetPct, 0),
  };
}

export function groupOf(idx: GroupIndex, symbol: string): string {
  return idx.symbolToGroup.get(String(symbol || '').toUpperCase().trim()) ?? OTHER_KEY;
}

/** เป้าหมายรายตัว = เป้าของหมวด ÷ จำนวนหุ้นในหมวด */
export function targetPctOfSymbol(idx: GroupIndex, symbol: string): number | null {
  const key = groupOf(idx, symbol);
  if (key === OTHER_KEY) return null;
  const g = idx.byKey.get(key);
  if (!g || !g.symbols.length) return null;
  return g.targetPct / g.symbols.length;
}

export { DEFAULT_GROUPS };
