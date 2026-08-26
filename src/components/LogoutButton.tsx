'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** ปุ่มออกจากระบบแบบมินิมอล — ไอคอนเดียว ไม่มีข้อความ */
export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      title="ออกจากระบบ"
      aria-label="ออกจากระบบ"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-forest/60 transition hover:bg-mist hover:text-forest disabled:opacity-50"
    >
      <span aria-hidden="true">🚪</span>
    </button>
  );
}
