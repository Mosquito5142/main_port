'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteButton({
  url,
  confirmText,
  label = '🗑',
  ariaLabel,
  className = 'btn-ghost btn-xs',
  redirectTo,
}: {
  url: string;
  confirmText: string;
  label?: string;
  /** ชื่อที่ screen reader อ่าน — จำเป็นเมื่อ label เป็นแค่ไอคอน (เช่น 🗑) ไม่มีข้อความกำกับ */
  ariaLabel?: string;
  className?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className}
      disabled={busy}
      aria-label={ariaLabel ?? (label === '🗑' ? 'ลบ' : undefined)}
      onClick={async () => {
        if (!confirm(confirmText)) return;
        setBusy(true);
        const res = await fetch(url, { method: 'DELETE' });
        setBusy(false);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          alert(json.error ?? 'ลบไม่สำเร็จ');
          return;
        }
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      }}
    >
      {busy ? '…' : label}
    </button>
  );
}
