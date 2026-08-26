import 'server-only';
import { cookies } from 'next/headers';

export const CURRENCY_COOKIE = 'gp_ccy';
export const SUPPORTED_DISPLAY = ['NATIVE', 'THB', 'USD'] as const;
export type DisplayCurrency = (typeof SUPPORTED_DISPLAY)[number];

export interface Fx {
  /** สกุลเงินที่จะแสดงผล */
  code: string;
  /** คูณจากสกุลเงินตั้งต้นเพื่อให้ได้สกุลที่แสดง */
  rate: number;
  /** true = แปลงค่าจริง (ไม่ใช่สกุลเดิม) */
  converted: boolean;
  /** เรตดิบไว้โชว์ให้ผู้ใช้เห็น เช่น 1 USD = 32.65 THB */
  note?: string;
}

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; rate: number }>();

/** อัตราแลกเปลี่ยนจาก Yahoo (สัญลักษณ์รูปแบบ USDTHB=X) */
export async function getFxRate(from: string, to: string): Promise<number | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;

  const key = `${f}${t}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rate;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${key}%3DX?range=1d&interval=1d`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) throw new Error(String(res.status));
    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    const rate = meta?.regularMarketPrice;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return hit?.rate ?? null;
    cache.set(key, { at: Date.now(), rate });
    return rate;
  } catch {
    return hit?.rate ?? null;
  }
}

export async function readDisplayCurrency(): Promise<DisplayCurrency> {
  const store = await cookies();
  const v = store.get(CURRENCY_COOKIE)?.value?.toUpperCase();
  return (SUPPORTED_DISPLAY as readonly string[]).includes(v ?? '')
    ? (v as DisplayCurrency)
    : 'NATIVE';
}

/**
 * คำนวณตัวคูณสำหรับแสดงผล โดยอิงสกุลเงินตั้งต้นของพอร์ต
 * ถ้าดึงเรตไม่ได้จะถอยกลับไปใช้สกุลเดิม (ไม่แปลง) เพื่อไม่ให้ตัวเลขมั่ว
 */
export async function getFx(baseCurrency: string): Promise<Fx> {
  const base = (baseCurrency || 'USD').toUpperCase();
  const want = await readDisplayCurrency();

  if (want === 'NATIVE' || want === base) {
    return { code: base, rate: 1, converted: false };
  }

  const rate = await getFxRate(base, want);
  if (rate === null) {
    return {
      code: base,
      rate: 1,
      converted: false,
      note: `ดึงอัตราแลกเปลี่ยน ${base}→${want} ไม่ได้ แสดงเป็น ${base} ตามเดิม`,
    };
  }

  return {
    code: want,
    rate,
    converted: true,
    note: `1 ${base} = ${rate.toLocaleString('th-TH', { maximumFractionDigits: 4 })} ${want}`,
  };
}
