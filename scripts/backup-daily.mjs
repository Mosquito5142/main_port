#!/usr/bin/env node
/**
 * สำรองข้อมูลจาก Turso อัตโนมัติทุกวัน — ตั้งให้รันเองผ่าน Windows Task Scheduler
 * (ดูวิธีตั้ง/ตรวจสอบใน README หัวข้อ "Backup อัตโนมัติรายวัน")
 *
 * เก็บไฟล์แยกตามวันที่ backups/portfolio-YYYY-MM-DD.db และลบไฟล์ที่เก่ากว่า KEEP_DAYS วันทิ้งอัตโนมัติ
 * เขียน log ไว้ที่ backups/backup.log ทุกครั้งที่รัน (เช็กย้อนหลังได้ว่ารันสำเร็จ/พังวันไหน)
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, loadEnv, backupTurso, pruneOldBackups } from './lib/backup-core.mjs';

const KEEP_DAYS = 30;
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log');

function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}`;
  console.log(msg);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

async function main() {
  loadEnv();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const out = path.join(BACKUP_DIR, `portfolio-${today}.db`);

  try {
    const { total, perTable } = await backupTurso(out);
    const summary = perTable.map((t) => `${t.name}=${t.rows}`).join(', ');
    log(`✅ สำรองสำเร็จ ${out} — ${total} แถวรวม (${summary})`);
  } catch (err) {
    log(`❌ สำรองล้มเหลว: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const removed = pruneOldBackups(BACKUP_DIR, KEEP_DAYS);
  if (removed.length) log(`🧹 ลบไฟล์เก่ากว่า ${KEEP_DAYS} วันทิ้ง: ${removed.join(', ')}`);
}

main();
