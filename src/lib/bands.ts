/**
 * กรอบสัดส่วน (min–max) และสถานะสั้น ๆ
 * ไฟล์นี้ไม่มี server-only เพื่อให้ทั้งหน้าเซิร์ฟเวอร์และการ์ดฝั่ง client ใช้ร่วมกันได้
 */

export type BandStatus = 'under' | 'over' | 'ok';

export const STATUS_LABEL: Record<BandStatus, string> = {
  under: 'ต่ำเป้า',
  over: 'เกินเป้า',
  ok: 'พอดี',
};

/** รหัส hint สั้น ๆ ที่เก็บใน DB — ข้อความบน UI ให้สั้นเท่านี้ ไม่เขียนประโยคยาว */
export const HINT_LABEL: Record<string, string> = {
  no_new: 'อย่าเติม',
  wait_earn: 'รอดูงบ',
  no_avg: 'อย่าถัว',
};

/** กันตัวเลขกระพริบข้ามขอบกรอบเพราะทศนิยม */
const BAND_EPS = 0.25;

export function bandStatus(
  actual: number,
  min: number | null | undefined,
  max: number | null | undefined
): BandStatus {
  if (max != null && Number.isFinite(max) && actual > max + BAND_EPS) return 'over';
  // พื้น 0 แปลว่าเป็นเพดานอย่างเดียว (เช่น ≤3%) — ถือว่าไม่ "ต่ำเป้า"
  if (min != null && Number.isFinite(min) && min > BAND_EPS && actual < min - BAND_EPS) {
    return 'under';
  }
  return 'ok';
}

function pctText(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** ข้อความกรอบสำหรับโชว์ เช่น "12–15%" หรือ "≤3%" */
export function formatBand(
  min: number | null | undefined,
  max: number | null | undefined,
  aim = 0
): string {
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (hasMin && hasMax) {
    if (min! <= 0.05 && max! > 0) return `≤${pctText(max!)}%`;
    if (Math.abs(min! - max!) < 0.05) return `${pctText(min!)}%`;
    return `${pctText(min!)}–${pctText(max!)}%`;
  }
  if (hasMax && max! > 0) return `≤${pctText(max!)}%`;
  if (aim > 0) return `${pctText(aim)}%`;
  return '—';
}

/** สีสถานะแบบอ่อน อ่านร่วมกับข้อความ ไม่พึ่งสีอย่างเดียว */
export function statusTone(status: BandStatus): string {
  if (status === 'over') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'under') return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

export function hintLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return HINT_LABEL[code] ?? null;
}
