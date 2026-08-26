import { fail, handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * ส่งไม้เข้าซื้อ (แนวรับ) เข้า Google Sheet จริง ผ่าน Apps Script เดิม
 * (ตัวเดียวกับที่ระบบ LineNotify_Watchlist ใช้ยิงแจ้งเตือน LINE)
 *
 * คงรูปแบบ payload เดิมทุกประการ (actionType: "WATCHLIST") เพื่อให้ Apps Script
 * ฝั่งนั้นทำงานต่อได้โดยไม่ต้องแก้อะไร — พอร์ตมาจาก portfolio_finance/api/alerts/watchlist
 */

interface WatchlistItem {
  ticker: string;
  entry: number;
  cut?: number;
  target?: number;
  alertType?: string;
  triggerPrice?: number;
  note?: string;
}

export async function POST(req: Request) {
  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      return fail('ยังไม่ได้ตั้งค่า GOOGLE_SCRIPT_URL ใน .env.local', 500);
    }

    const body = await req.json();
    const items: WatchlistItem[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return fail('ไม่มีรายการให้ส่ง');

    const cleaned = items
      .map((it) => ({
        ticker: String(it.ticker ?? '').toUpperCase().trim(),
        entry: Number(it.entry),
        cut: Number(it.cut) || 0,
        target: Number(it.target) || 0,
        alertType: it.alertType || 'SMART_ENTRY',
        triggerPrice: Number(it.triggerPrice) || Number(it.entry),
        note: it.note ?? '',
      }))
      .filter((it) => it.ticker && Number.isFinite(it.entry) && it.entry > 0);

    if (!cleaned.length) return fail('ไม่มีรายการที่ราคาถูกต้องให้ส่ง');

    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType: 'WATCHLIST', items: cleaned }),
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) return fail(`Apps Script ตอบกลับ ${res.status}: ${text.slice(0, 200)}`, 502);

    return ok({ sent: cleaned.length, response: data });
  } catch (err) {
    return handle(err);
  }
}
