'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Result {
  buys: number;
  sells: number;
  stocks: number;
  levels: number;
  targets: number;
  latestTradeDate: string | null;
  warnings: string[];
}

export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'sync ไม่สำเร็จ');
      setResult(json);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-soft" onClick={run} disabled={busy}>
        {busy ? '⏳ กำลังดึงจาก Turso…' : '🔄 ดึงข้อมูลล่าสุดจากชีต'}
      </button>
      {result && (
        <span className="text-[11px] text-emerald-700">
          ซื้อ {result.buys} · ขาย {result.sells} · หุ้น {result.stocks} ตัว
          {result.latestTradeDate ? ` · ล่าสุด ${result.latestTradeDate}` : ''}
        </span>
      )}
      {error && <span className="max-w-xs text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
