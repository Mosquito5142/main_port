/**
 * แปลงข้อความ "โพย" (คัดลอกมาจากหน้าจอสัญญาณแนวรับ–แนวต้าน) เป็นรายการต่อหุ้น
 *
 * รูปแบบที่รองรับ (บรรทัดต่อบรรทัด):
 *   PFE
 *   25 ส.ค. 23:18
 *   รับ: $28.4, $26.5, $25.2, $23.7, $20.9
 *   ต้าน: $30.5, $33.7, $37.2
 *   ซ่อน
 *   เลือก
 *   New
 *   ... (ตัวถัดไป)
 *
 * บรรทัด "ซ่อน" / "เลือก" / "New" เป็นปุ่มบนหน้าจอต้นทาง ไม่ใช่ข้อมูล ข้ามทิ้ง
 */

export interface ParsedSignal {
  id: string;
  ticker: string;
  /** ข้อความวันที่ดิบตามที่วาง เช่น "25 ส.ค. 23:18" (ไม่แปลงเป็น Date เพราะปีปฏิทินไม่ชัดเจน) */
  datetime: string;
  supports: number[];
  resistances: number[];
}

const SKIP_LINES = new Set(['ซ่อน', 'เลือก', 'New']);

function parsePriceList(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.replace(/[$,\s]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function parseSignalText(text: string): ParsedSignal[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  const results: ParsedSignal[] = [];
  let i = 0;

  while (i < lines.length) {
    if (SKIP_LINES.has(lines[i])) {
      i++;
      continue;
    }

    const ticker = lines[i].toUpperCase();
    if (i + 1 >= lines.length) break;
    const datetime = lines[i + 1];
    i += 2;

    let supports: number[] = [];
    let resistances: number[] = [];

    while (i < lines.length && (lines[i].startsWith('รับ:') || lines[i].startsWith('ต้าน:'))) {
      if (lines[i].startsWith('รับ:')) {
        supports = parsePriceList(lines[i].replace('รับ:', ''));
      } else {
        resistances = parsePriceList(lines[i].replace('ต้าน:', ''));
      }
      i++;
    }

    if (supports.length === 0 && resistances.length === 0) continue;

    results.push({
      id: `${ticker}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      ticker,
      datetime,
      supports,
      resistances,
    });
  }

  return results;
}

/** จำนวนไม้ (แนวรับ) มากที่สุดที่เจอในชุดข้อมูล — ไว้ทำตัวเลือก "เฉพาะไม้ N" */
export function maxTranches(items: ParsedSignal[]): number {
  return items.reduce((max, it) => Math.max(max, it.supports.length), 0);
}
