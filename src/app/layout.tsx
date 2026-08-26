import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { readDisplayCurrency } from '@/lib/currency';
import { readTheme } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'GreenPort — พอร์ตหุ้นของเรา',
  description: 'จัดการพอร์ตหุ้น สัดส่วนเป้าหมาย แนวรับแนวต้าน และเปรียบเทียบแผนการลงทุน',
  icons: { icon: '/favicon.svg', apple: '/icon-192.png' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'GreenPort' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E8F5E9' },
    { media: '(prefers-color-scheme: dark)', color: '#10190f' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const displayCurrency = await readDisplayCurrency();
  const theme = await readTheme();
  // middleware ใส่ header นี้ให้ทุก request — ใช้ซ่อน Sidebar เฉพาะหน้า /login (ยังไม่ล็อกอิน)
  const hdrs = await headers();
  const isLoginPage = hdrs.get('x-pathname') === '/login';

  return (
    // suppressHydrationWarning: ส่วนขยายเบราว์เซอร์ (เช่น Night Eye, Dark Reader, Grammarly)
    // มักเติม attribute ใส่ <html>/<body> ก่อน React hydrate ทำให้ขึ้น warning โดยไม่จำเป็น
    // data-theme มาจากคุกกี้ที่ ThemeToggle ตั้งไว้ (light/dark เท่านั้น) — เรนเดอร์จาก server เลยไม่มีการกะพริบธีม (FOUC)
    <html lang="th" suppressHydrationWarning data-theme={theme}>
      <body>
        <ServiceWorkerRegister />
        {isLoginPage ? (
          children
        ) : (
          <div className="flex min-h-screen">
            <Sidebar displayCurrency={displayCurrency} theme={theme} />
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10">
              <div className="mx-auto w-full max-w-[1400px] animate-fade-up">{children}</div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
