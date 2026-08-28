'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

type ThemeMode = 'light' | 'dark';

/**
 * ตัดสินใจว่าจะโชว์ Sidebar มั้ยด้วย usePathname() (client-side hook) แทนที่จะอ่าน
 * header ที่ middleware ยัดมาให้ผ่าน headers() ใน layout.tsx (เคยใช้แบบนั้นมาก่อน)
 *
 * เหตุผลที่เปลี่ยน: root layout render ครั้งเดียวแล้ว Next.js อาจ cache ผลลัพธ์นั้นไว้ใน
 * client-side Router Cache — พอ login สำเร็จแล้ว router.push ไปหน้าอื่น บาง edge case
 * layout เก่า (ที่เคย render ตอนยังอยู่หน้า /login เลย isLoginPage=true) จะถูกใช้ซ้ำ
 * ทำให้ Sidebar หายไปทั้งที่ URL เปลี่ยนไปแล้ว usePathname() อ่านค่าจาก client router
 * โดยตรง ไม่ผ่าน cache ตัวนี้ เลยไม่มีปัญหานี้
 */
export default function AppShell({
  children,
  displayCurrency,
  theme,
}: {
  children: React.ReactNode;
  displayCurrency: string;
  theme: ThemeMode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar displayCurrency={displayCurrency} theme={theme} />
      {/* pt-20 บนมือถือ = เว้นที่ให้แถบเมนูบนที่เป็น fixed (สูง h-16/64px) ไม่ให้ทับเนื้อหา
          ต้องเว้นที่ตรงนี้ ไม่ใช่ใส่ div คั่นใน Sidebar เพราะ parent เป็น flex แนวนอน
          ตัว div คั่นจะกินพื้นที่แนวกว้างแทนที่จะดันเนื้อหาลง */}
      <main className="min-w-0 flex-1 px-4 pb-6 pt-20 sm:px-8 lg:px-10 lg:pt-6">
        <div className="mx-auto w-full max-w-[1400px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
