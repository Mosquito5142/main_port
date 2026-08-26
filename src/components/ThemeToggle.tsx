'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

// ห้าม import จาก '@/lib/theme' ตรง ๆ — ไฟล์นั้นมี 'server-only' guard (ใช้ next/headers)
// เอาไว้ใน client component จะทำให้ build พัง จึงประกาศ type/ค่าคงที่ซ้ำที่นี่แทน
// (แพทเทิร์นเดียวกับ CurrencyToggle.tsx ที่ไม่ import จาก '@/lib/currency')
type ThemeMode = 'light' | 'dark';
const THEME_COOKIE = 'gp_theme';

/** ปุ่มเดียวสลับสว่าง/มืด — กดครั้งเดียวเปลี่ยนธีมทันที ไม่มีเมนูย่อย */
export default function ThemeToggle({ current }: { current: ThemeMode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<ThemeMode>(current);

  function toggle() {
    const next: ThemeMode = value === 'dark' ? 'light' : 'dark';
    setValue(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.setAttribute('data-theme', next);
    startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={toggle}
      title={value === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      aria-label={value === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-lg text-sm transition',
        'text-forest/60 hover:bg-mist hover:text-forest',
        pending ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span aria-hidden="true">{value === 'dark' ? '🌙' : '☀️'}</span>
    </button>
  );
}
