#!/usr/bin/env node
/**
 * แปลงประวัติซื้อขายจริงใน Turso เป็น CSV สำหรับ "Import" ที่ finance.yahoo.com
 *   node scripts/export-yahoo-csv.mjs [โฟลเดอร์ปลายทาง]
 *
 * รูปแบบคอลัมน์ตามที่ Yahoo กำหนด: Symbol,Trade Date,Purchase Price,Quantity
 *
 * ออกให้ 2 ไฟล์:
 *   1) holdings   = เฉพาะไม้ที่ยังถืออยู่ → ใช้ import เข้า Yahoo ให้พอร์ตตรงกับของจริง
 *   2) history    = ไม้ซื้อทั้งหมดที่เคยทำ (รวมที่ขายไปแล้ว) → เก็บไว้เป็นประวัติอ้างอิง
 *      *อย่าเอาไฟล์นี้ import เข้า Yahoo* เพราะ Yahoo ไม่มีแนวคิด "ขายแล้ว"
 *      มันจะคิดว่าเรายังถือหุ้นที่ขายไปแล้วทั้งหมด
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, loadEnv } from './lib/backup-core.mjs';
import { createClient } from '@libsql/client';

loadEnv();

const outDir = process.argv[2] ? path.resolve(process.argv[2]) : PROJECT_ROOT;
fs.mkdirSync(outDir, { recursive: true });

const db = createClient({
  url: process.env.tursourl ?? process.env.TURSO_DATABASE_URL,
  authToken: process.env.tursoToken ?? process.env.TURSO_AUTH_TOKEN,
});

/** ตัดทศนิยมท้าย ๆ ที่ไม่จำเป็นออก (0.0866901000 -> 0.0866901) */
const num = (v, dp) => String(Number(Number(v).toFixed(dp)));

function toCsv(rows) {
  const head = 'Symbol,Trade Date,Purchase Price,Quantity';
  const body = rows.map(
    (r) => `${r.ticker},${r.buy_date},${num(r.price, 4)},${num(r.qty, 8)}`
  );
  // ใส่ CRLF — ปลอดภัยกับ Excel/Yahoo มากกว่า LF เปล่า ๆ
  return [head, ...body].join('\r\n') + '\r\n';
}

const res = await db.execute(`
  SELECT ticker, buy_date, price, quantity,
         COALESCE(sold_qty, 0) AS sold_qty
    FROM trades
   WHERE UPPER(TRIM(ticker)) <> 'CASH'
     AND buy_date IS NOT NULL AND TRIM(buy_date) <> ''
     AND quantity > 0
   ORDER BY buy_date ASC, ticker ASC
`);

const all = res.rows.map((r) => ({
  ticker: String(r.ticker).toUpperCase().trim(),
  buy_date: String(r.buy_date).trim(),
  price: Number(r.price),
  qty: Number(r.quantity),
  remaining: Number(r.quantity) - Number(r.sold_qty),
}));

// ไม้ที่ยังถืออยู่ (เหลือมากกว่าเศษ floating point)
const held = all.filter((r) => r.remaining > 1e-9).map((r) => ({ ...r, qty: r.remaining }));

const holdingsPath = path.join(outDir, 'greenport-holdings-yahoo.csv');
const historyPath = path.join(outDir, 'greenport-history-yahoo.csv');
fs.writeFileSync(holdingsPath, toCsv(held), 'utf8');
fs.writeFileSync(historyPath, toCsv(all), 'utf8');

const uniq = (a) => [...new Set(a.map((r) => r.ticker))].sort();
console.log(`✅ ถือครองอยู่  : ${holdingsPath}`);
console.log(`   ${held.length} ไม้ · ${uniq(held).length} ตัว: ${uniq(held).join(', ')}`);
console.log(`\n✅ ประวัติทั้งหมด: ${historyPath}`);
console.log(`   ${all.length} ไม้ · ${uniq(all).length} ตัว`);
