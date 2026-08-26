// แกนหลักของการสำรองข้อมูล — ใช้ร่วมกันโดย backup-turso.mjs (สั่งเองตอนไหนก็ได้)
// และ backup-daily.mjs (รันอัตโนมัติทุกวันผ่าน Windows Task Scheduler)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** โหลด .env.local / .env จากโฟลเดอร์โปรเจกต์ — ใช้ path เต็มเสมอ ไม่พึ่ง process.cwd()
 *  เพราะ Task Scheduler มักรันด้วย working directory อื่นที่ไม่ใช่โฟลเดอร์โปรเจกต์ */
export function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(PROJECT_ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

/** ดึงตาราง trades/stocks/sync_log (ข้อมูลจริงของผู้ใช้) จาก Turso มาเป็นไฟล์ SQLite ในเครื่อง
 *  คืนค่าจำนวนแถวรวมที่สำรองได้ */
export async function backupTurso(outPath) {
  const url = process.env.tursourl ?? process.env.TURSO_DATABASE_URL;
  const authToken = process.env.tursoToken ?? process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('ไม่พบ tursourl ใน .env.local');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.rmSync(outPath);

  const remote = createClient({ url, authToken });
  const local = createClient({ url: `file:${outPath}` });

  const tables = await remote.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'gp_%'`
  );

  let total = 0;
  const perTable = [];
  for (const t of tables.rows) {
    const name = t.name;
    const ddl = t.sql;
    if (!ddl) continue;
    await local.execute(ddl);
    const rows = await remote.execute(`SELECT * FROM "${name}"`);
    if (rows.rows.length) {
      const cols = rows.columns;
      const ph = cols.map(() => '?').join(',');
      const stmts = rows.rows.map((r) => ({
        sql: `INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${ph})`,
        args: cols.map((c) => r[c] ?? null),
      }));
      for (let i = 0; i < stmts.length; i += 200) await local.batch(stmts.slice(i, i + 200), 'write');
    }
    perTable.push({ name, rows: rows.rows.length });
    total += rows.rows.length;
  }
  return { total, perTable };
}

/** ลบไฟล์สำรองที่เก่ากว่า keepDays วัน ในโฟลเดอร์ dir (กันดิสก์เต็มจากการรันทุกวันไม่มีที่สิ้นสุด) */
export function pruneOldBackups(dir, keepDays, pattern = /^portfolio-\d{4}-\d{2}-\d{2}\.db$/) {
  if (!fs.existsSync(dir)) return [];
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const f of fs.readdirSync(dir)) {
    if (!pattern.test(f)) continue;
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.mtimeMs < cutoff) {
      fs.rmSync(p);
      removed.push(f);
    }
  }
  return removed;
}
