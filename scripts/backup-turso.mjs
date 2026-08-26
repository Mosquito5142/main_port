#!/usr/bin/env node
/**
 * ดึงข้อมูลจาก Turso มาเก็บเป็นไฟล์ SQLite ในเครื่อง (backup) — สั่งเองตอนไหนก็ได้
 *   node scripts/backup-turso.mjs [output.db]
 *
 * สำหรับ backup อัตโนมัติรายวัน ดู scripts/backup-daily.mjs (ตั้งผ่าน Windows Task Scheduler)
 */
import path from 'node:path';
import { PROJECT_ROOT, loadEnv, backupTurso } from './lib/backup-core.mjs';

loadEnv();

const out = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(PROJECT_ROOT, 'data', 'portfolio.db');

const { total, perTable } = await backupTurso(out);
for (const t of perTable) console.log(`${t.name}: ${t.rows} แถว`);
console.log(`\n✅ สำรองไว้ที่ ${out} (${total} แถว)`);
