import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth-edge';

// เส้นทางที่เปิดให้เข้าได้โดยไม่ต้องล็อกอิน — หน้า login เอง + ไฟล์ PWA/สแตติกที่ต้องโหลดได้ก่อนล็อกอิน
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // ไม่ตั้งค่า AUTH_SECRET ไว้ — fail closed (กันไว้ก่อนดีกว่าเปิดเว็บทิ้งไว้เฉย ๆ)
  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const valid = secret ? await verifySessionToken(token, secret) : false;

  if (valid) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'ต้องล็อกอินก่อน' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // ครอบทุกเส้นทางยกเว้นไฟล์สแตติกของ Next เอง (_next/static, _next/image)
  matcher: ['/((?!_next/static|_next/image).*)'],
};
