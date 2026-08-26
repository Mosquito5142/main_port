'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Currency = 'NATIVE' | 'THB';

/** ปุ่มเดียวสลับสกุลเงิน — กดครั้งเดียวสลับทันที ไม่มีเมนูย่อย */
export default function CurrencyToggle({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<Currency>(current === 'THB' ? 'THB' : 'NATIVE');

  function toggle() {
    const next: Currency = value === 'THB' ? 'NATIVE' : 'THB';
    setValue(next);
    document.cookie = `gp_ccy=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={toggle}
      title={value === 'THB' ? 'สลับเป็นสกุลเงินเดิม' : 'สลับเป็นเงินบาท'}
      aria-label={value === 'THB' ? 'สลับเป็นสกุลเงินเดิม' : 'สลับเป็นเงินบาท'}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition',
        'text-forest/60 hover:bg-mist hover:text-forest',
        pending ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span aria-hidden="true">{value === 'THB' ? '฿' : '🌐'}</span>
    </button>
  );
}
