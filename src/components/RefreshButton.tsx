'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

export default function RefreshButton({ autoSeconds = 0 }: { autoSeconds?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [auto, setAuto] = useState(false);
  const [last, setLast] = useState<string>('');

  useEffect(() => {
    setLast(new Date().toLocaleTimeString('th-TH'));
  }, []);

  useEffect(() => {
    if (!auto || !autoSeconds) return;
    const id = setInterval(() => {
      startTransition(() => router.refresh());
      setLast(new Date().toLocaleTimeString('th-TH'));
    }, autoSeconds * 1000);
    return () => clearInterval(id);
  }, [auto, autoSeconds, router]);

  return (
    <div className="flex items-center gap-2">
      {autoSeconds > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-forest/60">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="h-4 w-4 accent-[#43A047]"
          />
          รีเฟรชอัตโนมัติทุก {autoSeconds} วิ
        </label>
      )}
      <button
        className="btn-soft btn-xs"
        disabled={pending}
        onClick={() => {
          startTransition(() => router.refresh());
          setLast(new Date().toLocaleTimeString('th-TH'));
        }}
        title={last ? `อัปเดตล่าสุด ${last}` : undefined}
      >
        {pending ? '⏳ กำลังดึงราคา…' : '🔄 รีเฟรชราคา'}
      </button>
    </div>
  );
}
