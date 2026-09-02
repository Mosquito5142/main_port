'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import CurrencyToggle from './CurrencyToggle';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';

// ประกาศ type ซ้ำแทนการ import จาก '@/lib/theme' (มี 'server-only' guard — ใช้ใน client component ไม่ได้)
type ThemeMode = 'light' | 'dark';

const NAV = [
  { href: '/', label: 'ภาพรวม', icon: '🌱', desc: 'Dashboard' },
  { href: '/portfolios', label: 'พอร์ตของฉัน', icon: '🧺', desc: 'Portfolios' },
  { href: '/trades', label: 'บันทึกซื้อขาย', icon: '🧾', desc: 'Trades' },
  { href: '/plan', label: 'วางแผนลงเงิน', icon: '🧭', desc: 'Monthly plan' },
  { href: '/calculator', label: 'คำนวณถัวเฉลี่ย', icon: '🧮', desc: 'Average calc' },
  { href: '/levels', label: 'แนวรับ–แนวต้าน', icon: '🎯', desc: 'Radar' },
  { href: '/import-signals', label: 'นำเข้าโพย', icon: '📋', desc: 'Import signals' },
  { href: '/compare', label: 'เทียบแผนพอร์ต', icon: '⚖️', desc: 'Compare' },
];

export default function Sidebar({
  displayCurrency = 'NATIVE',
  theme = 'light',
}: {
  displayCurrency?: string;
  theme?: ThemeMode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar — สูง h-16 (64px) ตายตัว ให้ตรงกับ spacer ด้านล่างเป๊ะ ๆ
          ไม่งั้นเนื้อหาบรรทัดแรกจะถูกแถบนี้ทับ (เคยทับอยู่ ~33px) */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-leaf/60 bg-surface/85 px-4 backdrop-blur lg:hidden">
        <Brand compact />
        <button
          onClick={() => setOpen((v) => !v)}
          // ปุ่มเมนูเป็นทางเดียวที่จะเปิดเมนูบนมือถือ — ต้องกดง่าย
          // min-h/min-w 44px ตามเกณฑ์ขนาดเป้ากดขั้นต่ำของ WCAG
          className="btn-soft inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 text-sm"
          aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={open}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span> เมนู
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-forest/20 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={[
          'fixed z-50 flex h-screen w-[264px] shrink-0 flex-col gap-2 border-r border-leaf/60',
          'bg-surface/80 px-4 py-6 backdrop-blur-md transition-transform duration-300 lg:sticky lg:top-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="px-2 pb-4">
          <Brand />
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={[
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
                  active
                    ? 'text-white shadow-leafy'
                    : 'text-forest/75 hover:bg-mist hover:text-forest',
                ].join(' ')}
                style={
                  active
                    ? { backgroundImage: 'linear-gradient(135deg,#66BB6A 0%,#1B5E20 100%)' }
                    : undefined
                }
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold">{item.label}</span>
                  <span
                    className={[
                      'text-[10px] uppercase tracking-widest',
                      active ? 'text-white/70' : 'text-forest/40',
                    ].join(' ')}
                  >
                    {item.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mb-3 flex items-center justify-end gap-1">
          <CurrencyToggle current={displayCurrency} />
          <ThemeToggle current={theme} />
          <LogoutButton />
        </div>

        <div className="rounded-xl border border-leaf/60 bg-mist/70 p-3 text-[11px] leading-relaxed text-forest/70">
          ราคาดึงจาก <b>Yahoo Finance</b> แคช 60 วินาที
          <br />
          หุ้นไทยใส่ท้ายด้วย <code className="rounded bg-surface px-1">.BK</code> เช่น{' '}
          <code className="rounded bg-surface px-1">PTT.BK</code>
        </div>
      </aside>

      {/* ที่เว้นให้พ้นแถบบนอยู่ที่ pt-20 ของ <main> ใน AppShell.tsx แล้ว
          (ใส่ div คั่นตรงนี้ไม่ได้ผล เพราะ parent เป็น flex แนวนอน) */}
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl text-xl shadow-leafy"
        style={{ backgroundImage: 'linear-gradient(135deg,#A5D6A7 0%,#1B5E20 100%)' }}
      >
        🍃
      </div>
      <div className="leading-tight">
        <div className="text-lg font-extrabold tracking-tight text-forest">GreenPort</div>
        {!compact && (
          <div className="text-[10px] uppercase tracking-[0.25em] text-grass">
            stock portfolio
          </div>
        )}
      </div>
    </div>
  );
}
