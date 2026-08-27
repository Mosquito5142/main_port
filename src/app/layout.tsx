import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
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

  return (
    // suppressHydrationWarning: ส่วนขยายเบราว์เซอร์ (เช่น Night Eye, Dark Reader, Grammarly)
    // มักเติม attribute ใส่ <html>/<body> ก่อน React hydrate ทำให้ขึ้น warning โดยไม่จำเป็น
    // data-theme มาจากคุกกี้ที่ ThemeToggle ตั้งไว้ (light/dark เท่านั้น) — เรนเดอร์จาก server เลยไม่มีการกะพริบธีม (FOUC)
    <html lang="th" suppressHydrationWarning data-theme={theme}>
      <body>
        <ServiceWorkerRegister />
        <AppShell displayCurrency={displayCurrency} theme={theme}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
