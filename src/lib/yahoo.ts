import 'server-only';
import { query } from './db';
import type { Quote } from './types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const QUOTE_TTL_MS = 60_000;
/** เกิน TTL แต่ไม่เกินค่านี้ = คืนของเก่าไปก่อน แล้วรีเฟรชเบื้องหลัง (stale-while-revalidate) */
const STALE_GRACE_MS = 30 * 60_000;
const HISTORY_TTL_MS = 10 * 60_000;

type CacheEntry<T> = { at: number; data: T };

declare global {
  // eslint-disable-next-line no-var
  var __gp_memQuote: Map<string, CacheEntry<Quote>> | undefined;
  // eslint-disable-next-line no-var
  var __gp_memHistory: Map<string, CacheEntry<ChartResult>> | undefined;
  // eslint-disable-next-line no-var
  var __gp_quoteWarm: Promise<void> | undefined;
}

// เก็บบน globalThis ไม่ใช่ module scope — ไม่งั้น Next dev ที่ reload module
// (และ serverless ที่สร้าง instance ใหม่) จะทำให้แคชหายทุกครั้ง แล้วต้องยิง Yahoo ใหม่หมด
const memQuote = (global.__gp_memQuote ??= new Map<string, CacheEntry<Quote>>());
const memHistory = (global.__gp_memHistory ??= new Map<string, CacheEntry<ChartResult>>());

export interface Candle {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface ChartResult {
  symbol: string;
  currency: string | null;
  shortName: string | null;
  exchange: string | null;
  candles: Candle[];
}

async function yfetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status} ${res.statusText}`);
  return res.json();
}

function toDateStr(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

const inflightChart = new Map<string, Promise<ChartResult>>();

/**
 * ดึงกราฟ (ใช้ endpoint /v8/finance/chart ซึ่งไม่ต้องใช้ crumb)
 *
 * แคชผลไว้ HISTORY_TTL_MS และรวม request ที่ซ้ำกันให้เหลือครั้งเดียว
 * (ก่อนหน้านี้แคชถูกใช้เฉพาะตอน Yahoo ล่ม ทำให้ทุกครั้งที่เปิดกราฟยิงใหม่หมด)
 */
export async function fetchChart(
  symbol: string,
  range = '6mo',
  interval = '1d'
): Promise<ChartResult> {
  const key = `${symbol}|${range}|${interval}`;
  const hit = memHistory.get(key);
  if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.data;

  const existing = inflightChart.get(key);
  if (existing) return existing;

  const p = (async () => {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`;

    let json: any;
    try {
      json = await yfetch(url);
    } catch (err) {
      if (hit) return hit.data; // ดึงไม่ได้ -> ใช้ของเก่าแม้จะหมดอายุแล้ว
      throw err;
    }

    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`ไม่พบข้อมูลของ ${symbol}`);

    const meta = result.meta ?? {};
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const adj = result.indicators?.adjclose?.[0]?.adjclose;

    const candles: Candle[] = ts
      .map((t, i) => ({
        date: toDateStr(t),
        open: num(q.open?.[i]),
        high: num(q.high?.[i]),
        low: num(q.low?.[i]),
        close: num(q.close?.[i] ?? adj?.[i]),
        volume: num(q.volume?.[i]),
      }))
      .filter((c) => c.close !== null);

    const out: ChartResult = {
      symbol: meta.symbol ?? symbol,
      currency: meta.currency ?? null,
      shortName: meta.shortName ?? meta.longName ?? null,
      exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
      candles,
    };
    memHistory.set(key, { at: Date.now(), data: out });
    return out;
  })().finally(() => inflightChart.delete(key));

  inflightChart.set(key, p);
  return p;
}

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function fetchQuoteFresh(symbol: string): Promise<Quote> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=1d&interval=1d`;
  const json = await yfetch(url);
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`ไม่พบราคาของ ${symbol}`);

  const price = num(meta.regularMarketPrice);
  const prev = num(meta.chartPreviousClose ?? meta.previousClose);

  return {
    symbol: meta.symbol ?? symbol,
    price,
    previousClose: prev,
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    currency: meta.currency ?? null,
    shortName: meta.shortName ?? meta.longName ?? null,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    changePercent:
      price !== null && prev ? ((price - prev) / prev) * 100 : null,
  };
}

/** กันยิงซ้ำ: ถ้ามี request ของสัญลักษณ์เดียวกันค้างอยู่ ให้รอตัวเดิมแทนที่จะยิงใหม่ */
const inflight = new Map<string, Promise<Quote>>();

/**
 * คิวรีเฟรชเบื้องหลัง — จำกัดให้ทำทีละไม่กี่ตัว
 *
 * ถ้าปล่อยให้ยิงพร้อมกันทั้ง 40 ตัวตอนแคชหมดอายุ งานเบื้องหลังจะแย่ง event loop
 * จน request ที่กำลัง render อยู่ช้าตามไปด้วย (ทั้งที่ SWR คืนค่าให้ทันทีแล้ว)
 */
const bgQueue: { symbol: string; key: string }[] = [];
let bgRunning = 0;
const BG_MAX_CONCURRENT = 3;

function pumpBackgroundQueue() {
  while (bgRunning < BG_MAX_CONCURRENT && bgQueue.length) {
    const job = bgQueue.shift()!;
    if (inflight.has(job.key)) continue;
    bgRunning++;
    const p = refreshQuote(job.symbol, job.key)
      .catch(() => undefined)
      .finally(() => {
        inflight.delete(job.key);
        bgRunning--;
        pumpBackgroundQueue();
      });
    inflight.set(job.key, p as Promise<Quote>);
  }
}

function queueBackgroundRefresh(symbol: string, key: string) {
  if (bgQueue.some((j) => j.key === key)) return;
  bgQueue.push({ symbol, key });
  pumpBackgroundQueue();
}

/**
 * ราคาปัจจุบัน: memory cache -> Yahoo -> fallback price_cache ใน Postgres
 *
 * ใช้ stale-while-revalidate: ถ้าแคชหมดอายุแต่ยังไม่เกิน STALE_GRACE_MS
 * จะคืนค่าเดิมทันที แล้วค่อยไปดึงใหม่เบื้องหลัง — หน้าเว็บจะไม่ค้างรอ Yahoo
 * ตอนแคชหมดอายุพอดี (เดิมทุก 60 วินาทีจะมีคนซวยโดนบล็อกรอ 1 คน)
 */
export async function getQuote(symbol: string): Promise<Quote> {
  const key = symbol.toUpperCase();
  const hit = memQuote.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;

  if (hit && age < QUOTE_TTL_MS) return hit.data;

  // ยังพอใช้ได้ -> คืนของเดิมทันที แล้วรีเฟรชเบื้องหลัง
  if (hit && age < STALE_GRACE_MS) {
    if (!inflight.has(key)) queueBackgroundRefresh(symbol, key);
    return hit.data;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = refreshQuote(symbol, key)
    .catch(() => quoteFallback(key, hit?.data))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** ดึงราคาใหม่จริง + อัปเดตแคชทั้งใน memory และ Postgres */
async function refreshQuote(symbol: string, key: string): Promise<Quote> {
  const q = await fetchQuoteFresh(symbol);
  memQuote.set(key, { at: Date.now(), data: q });
  // เขียนลง price_cache แบบไม่ต้องรอ — ไม่ให้ DB write มาถ่วงการ render หน้า
  query(
    `INSERT INTO gp_price_cache (symbol, price, previous_close, day_high, day_low, currency, short_name, exchange, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, datetime('now'))
     ON CONFLICT (symbol) DO UPDATE SET
       price = EXCLUDED.price,
       previous_close = EXCLUDED.previous_close,
       day_high = EXCLUDED.day_high,
       day_low = EXCLUDED.day_low,
       currency = EXCLUDED.currency,
       short_name = EXCLUDED.short_name,
       exchange = EXCLUDED.exchange,
       fetched_at = datetime('now')`,
    [key, q.price, q.previousClose, q.dayHigh, q.dayLow, q.currency, q.shortName, q.exchange]
  ).catch(() => undefined);
  return q;
}

/** ดึงไม่ได้ -> ใช้ของเก่าใน memory ก่อน ไม่มีค่อยไปเอาจาก price_cache ใน Postgres */
async function quoteFallback(key: string, previous?: Quote): Promise<Quote> {
  if (previous) return { ...previous, stale: true };

  const row = await query<any>(`SELECT * FROM gp_price_cache WHERE symbol = $1`, [key]).catch(
    () => []
  );
  const c = row[0];
  if (!c) {
    return {
      symbol: key,
      price: null,
      previousClose: null,
      dayHigh: null,
      dayLow: null,
      currency: null,
      shortName: null,
      exchange: null,
      changePercent: null,
      stale: true,
    };
  }
  return {
    symbol: c.symbol,
    price: c.price,
    previousClose: c.previous_close,
    dayHigh: c.day_high,
    dayLow: c.day_low,
    currency: c.currency,
    shortName: c.short_name,
    exchange: c.exchange,
    changePercent:
      c.price !== null && c.previous_close
        ? ((c.price - c.previous_close) / c.previous_close) * 100
        : null,
    stale: true,
  };
}

/**
 * process เพิ่งเริ่ม (หรือ serverless instance ใหม่) -> ดึงราคาที่เคยบันทึกไว้ใน gp_price_cache
 * มาอุ่น memory cache ด้วย query เดียว แทนที่จะต้องยิง Yahoo ทีละตัวหลายสิบครั้ง
 *
 * ราคาที่ได้จะถูกมาร์กเป็น stale ตามอายุจริง แล้ว getQuote จะรีเฟรชเบื้องหลังให้เอง
 */
function warmQuoteCache(): Promise<void> {
  if (!global.__gp_quoteWarm) {
    global.__gp_quoteWarm = (async () => {
      try {
        const rows = await query<any>(
          `SELECT symbol, price, previous_close, day_high, day_low, currency,
                  short_name, exchange, fetched_at
             FROM gp_price_cache`
        );
        for (const c of rows) {
          const key = String(c.symbol).toUpperCase();
          if (memQuote.has(key)) continue; // ของสด ๆ ในหน่วยความจำสำคัญกว่า
          const at = c.fetched_at ? Date.parse(String(c.fetched_at).replace(' ', 'T') + 'Z') : 0;
          memQuote.set(key, {
            at: Number.isFinite(at) ? at : 0,
            data: {
              symbol: key,
              price: c.price,
              previousClose: c.previous_close,
              dayHigh: c.day_high,
              dayLow: c.day_low,
              currency: c.currency,
              shortName: c.short_name,
              exchange: c.exchange,
              changePercent:
                c.price !== null && c.previous_close
                  ? ((c.price - c.previous_close) / c.previous_close) * 100
                  : null,
            },
          });
        }
      } catch {
        /* อุ่นไม่ได้ก็ไม่เป็นไร ค่อยไปดึงจาก Yahoo ตามปกติ */
      }
    })();
  }
  return global.__gp_quoteWarm;
}

/**
 * ดึงหลายตัวพร้อมกัน — ยิงขนานทีเดียวทั้งชุด (จำกัดที่ MAX_CONCURRENT ไม่ให้ Yahoo เตะ)
 * เดิมยิงทีละ 8 ตัวแล้วรอให้ครบก่อนค่อยยิงชุดถัดไป ทำให้ 35 ตัวต้องรอ 5 รอบต่อกัน
 */
export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  await warmQuoteCache();

  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out = new Map<string, Quote>();
  const MAX_CONCURRENT = 16;

  let cursor = 0;
  const worker = async () => {
    while (cursor < uniq.length) {
      const idx = cursor++;
      const sym = uniq[idx];
      out.set(sym, await getQuote(sym));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, uniq.length) }, worker)
  );
  return out;
}

/** ค้นหาหุ้นจากชื่อ/สัญลักษณ์ */
export async function searchSymbol(q: string) {
  const url =
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}` +
    `&quotesCount=10&newsCount=0&listsCount=0`;
  try {
    const json = await yfetch(url);
    return (json?.quotes ?? [])
      .filter((x: any) => x.symbol)
      .map((x: any) => ({
        symbol: x.symbol as string,
        name: (x.shortname ?? x.longname ?? null) as string | null,
        exchange: (x.exchDisp ?? x.exchange ?? null) as string | null,
        type: (x.quoteType ?? null) as string | null,
      }));
  } catch {
    return [];
  }
}

/** map ราคาปิดรายวัน สำหรับคำนวณ equity curve */
export async function getDailyCloseMap(
  symbol: string,
  range = '1y'
): Promise<Map<string, number>> {
  const chart = await fetchChart(symbol, range, '1d');
  const m = new Map<string, number>();
  for (const c of chart.candles) if (c.close !== null) m.set(c.date, c.close);
  return m;
}

export { HISTORY_TTL_MS };
