'use client';

import { useEffect } from 'react';

/**
 * UI ข้อผิดพลาดใช้ร่วมกันทุกหน้า — แต่ละ route segment มี error.tsx ของตัวเอง
 * (ไม่ใช่แค่ root เดียว) เพื่อกันไม่ให้หน้าใดหน้าหนึ่งพังแล้วเทหน้าเว็บทั้งเว็บ
 * เพราะ error.tsx ระดับ segment จะแทนที่แค่เนื้อหาในหน้านั้น sidebar/แถบเมนูยังใช้ได้ปกติ
 */
export default function RouteError({
  error,
  reset,
  pageLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** ชื่อหน้าที่พัง เช่น "หน้าคำนวณถัวเฉลี่ย" — ใส่ไว้ให้รู้ว่าพังจุดไหน ไม่ใช่ทั้งเว็บ */
  pageLabel: string;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(`[${pageLabel}]`, error);
  }, [error, pageLabel]);

  const isDb =
    /ECONNREFUSED|ENOTFOUND|UNAUTHORIZED|SQLITE_|libsql|Turso|ตั้งค่าฐานข้อมูล|timeout/i.test(
      error.message ?? ''
    );

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-6xl">🍂</div>
      <h1 className="text-xl font-extrabold text-forest">{pageLabel}มีปัญหา</h1>
      <p className="max-w-lg text-sm text-forest/60">{error.message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'}</p>
      {isDb && (
        <div className="max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ดูเหมือนต่อฐานข้อมูลไม่ได้ — เช็กค่า{' '}
          <code className="rounded bg-surface px-1">tursourl</code> และ{' '}
          <code className="rounded bg-surface px-1">tursoToken</code> ใน .env.local
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button className="btn-primary" onClick={reset}>
          ลองใหม่อีกครั้ง
        </button>
        <a className="btn-soft" href="/">
          กลับหน้าแรก
        </a>
      </div>
      <p className="max-w-md text-xs text-forest/40">
        หน้าอื่น ๆ ในเว็บยังใช้งานได้ปกติ — ปัญหานี้อยู่แค่ในหน้านี้
      </p>
    </div>
  );
}
