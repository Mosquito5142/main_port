'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Portfolio } from '@/lib/types';
import PortfolioForm from './PortfolioForm';

export default function PortfolioActions({ portfolio }: { portfolio: Portfolio }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !confirm(
        `ลบพอร์ต "${portfolio.name}" ?\nรายการซื้อขายและสัดส่วนเป้าหมายทั้งหมดในพอร์ตนี้จะถูกลบไปด้วย`
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/portfolios/${portfolio.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? 'ลบไม่สำเร็จ');
      return;
    }
    router.refresh();
  }

  if (editing)
    return (
      <div className="mt-3">
        <PortfolioForm initial={portfolio} onDone={() => setEditing(false)} />
      </div>
    );

  return (
    <div className="flex gap-1">
      <button className="btn-ghost btn-xs" onClick={() => setEditing(true)}>
        ✏️ แก้ไข
      </button>
      <button className="btn-danger btn-xs" onClick={remove} disabled={busy}>
        🗑 ลบ
      </button>
    </div>
  );
}
