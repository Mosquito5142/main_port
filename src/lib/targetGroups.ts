import 'server-only';
import { query, tx } from './db';

/**
 * สัดส่วนเป้าหมายของพอร์ต แบบรายหมวด + กรอบรายตัว
 * เก็บใน DB (gp_target_groups + gp_group_symbols) แก้ได้จากหน้าเว็บ
 *
 * targetPct = เป้ากลาง (จุดที่ใช้จัดสรรเงินใหม่)
 * targetMin/targetMax = กรอบที่การ์ดใช้ตัดสิน ต่ำเป้า / พอดี / เกินเป้า
 * เพดานอย่างเดียว (เช่น ASTS ≤3%) ใช้ min 0 และเป้ากลาง 0 เพื่อไม่ไล่ซื้อให้เต็มเพดาน
 */

export interface GroupMember {
  symbol: string;
  targetPct: number | null;
  targetMin: number | null;
  targetMax: number | null;
  hint: string | null;
}

export interface TargetGroup {
  id: number;
  key: string;
  label: string;
  targetPct: number;
  targetMin: number | null;
  targetMax: number | null;
  hint: string | null;
  color: string;
  sortOrder: number;
  isOther: boolean;
  isCore: boolean;
  symbols: string[];
  members: GroupMember[];
}

export const OTHER_KEY = 'other';

function member(
  symbol: string,
  min: number,
  max: number,
  aim: number,
  hint: string | null = null
): GroupMember {
  return { symbol, targetMin: min, targetMax: max, targetPct: aim, hint };
}

/**
 * แผนสัดส่วนพอร์ตหลัก (USD) — พ.ย. 2026
 * เงินสดสำรอง 10–15 (กลาง 12) · Core 20–25 · Space/Defense 28–35
 * AI infra 18–22 · Speculative รวม ≤12 และต่อตัว ≤3
 */
const DEFAULT_GROUPS: Omit<TargetGroup, 'id'>[] = [
  {
    key: OTHER_KEY,
    label: 'เงินสดสำรอง',
    targetPct: 12,
    targetMin: 10,
    targetMax: 15,
    hint: null,
    color: '#64748b',
    sortOrder: 0,
    isOther: true,
    isCore: false,
    symbols: [],
    members: [],
  },
  {
    key: 'core',
    label: 'Core',
    targetPct: 22.5,
    targetMin: 20,
    targetMax: 25,
    hint: null,
    color: '#2563eb',
    sortOrder: 1,
    isOther: false,
    isCore: true,
    symbols: ['AXON', 'AMBA'],
    members: [member('AXON', 12, 15, 13.5), member('AMBA', 8, 10, 9)],
  },
  {
    key: 'space_defense',
    label: 'Space / Defense',
    targetPct: 31.5,
    targetMin: 28,
    targetMax: 35,
    hint: null,
    color: '#f97316',
    sortOrder: 2,
    isOther: false,
    isCore: false,
    symbols: ['RKLB', 'SPCX', 'KTOS', 'AVAV', 'ASTS'],
    members: [
      member('RKLB', 15, 18, 16.5, 'no_new'),
      member('SPCX', 5, 7, 6),
      member('KTOS', 5, 6, 5.5),
      member('AVAV', 2, 3, 2.5),
      // ≤3% เป็นเพดาน ไม่ใช่เป้าที่ต้องไล่ซื้อ
      member('ASTS', 0, 3, 0),
    ],
  },
  {
    key: 'ai_infra',
    label: 'AI infra',
    targetPct: 20,
    targetMin: 18,
    targetMax: 22,
    hint: null,
    color: '#14b8a6',
    sortOrder: 3,
    isOther: false,
    isCore: false,
    symbols: ['FPS', 'AEHR', 'CRDO', 'VST', 'FLTW'],
    members: [
      member('FPS', 5, 6, 5.5, 'wait_earn'),
      member('AEHR', 4, 5, 4.5),
      member('CRDO', 4, 5, 4.5),
      member('VST', 2, 3, 2.5),
      member('FLTW', 0, 2, 0),
    ],
  },
  {
    key: 'speculative',
    label: 'Speculative',
    targetPct: 0,
    targetMin: 0,
    targetMax: 12,
    hint: 'no_avg',
    color: '#a855f7',
    sortOrder: 4,
    isOther: false,
    isCore: false,
    symbols: ['IONQ', 'CLPT', 'OUST', 'VPG', 'AMBQ'],
    members: [
      member('IONQ', 0, 3, 0, 'no_avg'),
      member('CLPT', 0, 3, 0, 'no_avg'),
      member('OUST', 0, 3, 0, 'no_avg'),
      member('VPG', 0, 3, 0, 'no_avg'),
      member('AMBQ', 0, 3, 0, 'no_avg'),
    ],
  },
];

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** แผนใหม่ถูกเขียนแล้วหรือยัง — ดูจากหมวด space_defense ที่มีกรอบ (ไม่เทียบตัวเลขทีละช่อง เพื่อไม่ทับตอนผู้ใช้แก้เอง) */
function hasCurrentPlan(rows: TargetGroup[]): boolean {
  return rows.some((g) => g.key === 'space_defense' && g.targetMin != null && g.targetMax != null);
}

/** อ่านหมวดทั้งหมดของพอร์ต — ถ้ายังไม่เคยมี จะใส่ค่าเริ่มต้นให้อัตโนมัติ */
export async function listTargetGroups(portfolioId: number): Promise<TargetGroup[]> {
  let rows = await readGroups(portfolioId);
  if (!rows.length) {
    await saveTargetGroups(portfolioId, DEFAULT_GROUPS);
    return readGroups(portfolioId);
  }
  // พอร์ตหลัก: เขียนทับแผนเก่าครั้งเดียวตอนยังไม่มีหมวด Space/Defense แบบมีกรอบ
  if (portfolioId === 1 && !hasCurrentPlan(rows)) {
    await saveTargetGroups(portfolioId, DEFAULT_GROUPS);
    rows = await readGroups(portfolioId);
  }
  return rows;
}

async function readGroups(portfolioId: number): Promise<TargetGroup[]> {
  const [groups, syms] = await Promise.all([
    query<{
      id: number;
      key: string;
      label: string;
      target_pct: number;
      target_min: number | null;
      target_max: number | null;
      hint: string | null;
      color: string;
      sort_order: number;
      is_other: number;
      is_core: number;
    }>(
      `SELECT id, key, label, target_pct, target_min, target_max, hint, color, sort_order,
              is_other, COALESCE(is_core, 0) as is_core
         FROM gp_target_groups WHERE portfolio_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [portfolioId]
    ),
    query<{
      group_id: number;
      symbol: string;
      target_pct: number | null;
      target_min: number | null;
      target_max: number | null;
      hint: string | null;
    }>(
      `SELECT gs.group_id, gs.symbol, gs.target_pct, gs.target_min, gs.target_max, gs.hint
         FROM gp_group_symbols gs
         JOIN gp_target_groups g ON g.id = gs.group_id
        WHERE g.portfolio_id = $1
        ORDER BY gs.id`,
      [portfolioId]
    ),
  ]);
  if (!groups.length) return [];

  const byGroup = new Map<number, GroupMember[]>();
  for (const s of syms) {
    const arr = byGroup.get(s.group_id) ?? [];
    arr.push({
      symbol: String(s.symbol || '').toUpperCase(),
      targetPct: numOrNull(s.target_pct),
      targetMin: numOrNull(s.target_min),
      targetMax: numOrNull(s.target_max),
      hint: s.hint ? String(s.hint) : null,
    });
    byGroup.set(s.group_id, arr);
  }

  return groups.map((g) => {
    const members = byGroup.get(g.id) ?? [];
    return {
      id: g.id,
      key: g.key,
      label: g.label,
      targetPct: Number(g.target_pct) || 0,
      targetMin: numOrNull(g.target_min),
      targetMax: numOrNull(g.target_max),
      hint: g.hint ? String(g.hint) : null,
      color: g.color,
      sortOrder: g.sort_order,
      isOther: Boolean(g.is_other),
      isCore: Boolean(g.is_core),
      symbols: members.map((m) => m.symbol),
      members,
    };
  });
}

/** เขียนทับหมวดทั้งชุด */
export async function saveTargetGroups(
  portfolioId: number,
  groups: Omit<TargetGroup, 'id'>[]
): Promise<void> {
  await tx(async (q) => {
    await q(
      `DELETE FROM gp_group_symbols
        WHERE group_id IN (SELECT id FROM gp_target_groups WHERE portfolio_id = $1)`,
      [portfolioId]
    );
    await q(`DELETE FROM gp_target_groups WHERE portfolio_id = $1`, [portfolioId]);
    let order = 0;
    for (const g of groups) {
      const isOther = g.isOther || g.key === OTHER_KEY;
      const rows = await q<{ id: number }>(
        `INSERT INTO gp_target_groups
           (portfolio_id, key, label, target_pct, target_min, target_max, hint,
            color, sort_order, is_other, is_core, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, datetime('now')) RETURNING id`,
        [
          portfolioId,
          g.key,
          g.label,
          Number(g.targetPct) || 0,
          g.targetMin ?? null,
          g.targetMax ?? null,
          g.hint || null,
          g.color || '#66BB6A',
          order++,
          isOther ? 1 : 0,
          g.isCore ? 1 : 0,
        ]
      );
      const groupId = rows[0].id;
      const source: GroupMember[] =
        g.members?.length
          ? g.members
          : (g.symbols ?? []).map((symbol) => ({
              symbol,
              targetPct: null,
              targetMin: null,
              targetMax: null,
              hint: null,
            }));
      const seen = new Set<string>();
      for (const raw of source) {
        const sym = String(raw.symbol || '').toUpperCase().trim();
        if (!sym || seen.has(sym)) continue;
        seen.add(sym);
        await q(
          `INSERT INTO gp_group_symbols
             (group_id, symbol, target_pct, target_min, target_max, hint)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            groupId,
            sym,
            raw.targetPct ?? null,
            raw.targetMin ?? null,
            raw.targetMax ?? null,
            raw.hint || null,
          ]
        );
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
  memberBySymbol: Map<string, GroupMember & { groupKey: string }>;
  byKey: Map<string, TargetGroup>;
  totalTargetPct: number;
  coreKeys: Set<string>;
  coreSymbols: Set<string>;
}

export function indexGroups(groups: TargetGroup[]): GroupIndex {
  const symbolToGroup = new Map<string, string>();
  const memberBySymbol = new Map<string, GroupMember & { groupKey: string }>();
  const byKey = new Map<string, TargetGroup>();
  const coreKeys = new Set<string>();
  const coreSymbols = new Set<string>();
  for (const g of groups) {
    byKey.set(g.key, g);
    if (g.isCore) coreKeys.add(g.key);
    const list = g.members?.length
      ? g.members
      : g.symbols.map((symbol) => ({
          symbol,
          targetPct: null,
          targetMin: null,
          targetMax: null,
          hint: null,
        }));
    for (const m of list) {
      const sym = m.symbol.toUpperCase();
      symbolToGroup.set(sym, g.key);
      memberBySymbol.set(sym, { ...m, symbol: sym, groupKey: g.key });
      if (g.isCore) coreSymbols.add(sym);
    }
  }
  return {
    groups,
    symbolToGroup,
    memberBySymbol,
    byKey,
    totalTargetPct: groups.reduce((a, g) => a + g.targetPct, 0),
    coreKeys,
    coreSymbols,
  };
}

export function groupOf(idx: GroupIndex, symbol: string): string {
  return idx.symbolToGroup.get(String(symbol || '').toUpperCase().trim()) ?? OTHER_KEY;
}

/** ตรวจสอบว่าหุ้นเป็น Core หรือไม่ */
export function isCoreSymbol(idx: GroupIndex, symbol: string): boolean {
  return idx.coreSymbols.has(String(symbol || '').toUpperCase().trim());
}

/**
 * เป้าหมายรายตัว: ใช้เป้าของตัวนั้นถ้ามี
 * ไม่มีจึงค่อยหารเท่าจากเป้าหมวด (แผนเก่า)
 */
export function targetPctOfSymbol(idx: GroupIndex, symbol: string): number | null {
  const sym = String(symbol || '').toUpperCase().trim();
  const member = idx.memberBySymbol.get(sym);
  if (member?.targetPct != null) return member.targetPct;
  const key = groupOf(idx, symbol);
  if (key === OTHER_KEY) return null;
  const g = idx.byKey.get(key);
  if (!g || !g.symbols.length) return null;
  return g.targetPct / g.symbols.length;
}

/** Core แบบเก่าที่ไม่ได้ตั้งกรอบ จะยังลอยตามสัดส่วนจริง */
export function groupFloats(g: Pick<TargetGroup, 'isCore' | 'targetMin' | 'targetMax'>): boolean {
  return Boolean(g.isCore) && g.targetMin == null && g.targetMax == null;
}

export { DEFAULT_GROUPS };
