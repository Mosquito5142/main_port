import { NextResponse } from 'next/server';
import { AUTH_COOKIE, SESSION_MAX_AGE, createSessionToken, timingSafeEqual } from '@/lib/auth-edge';

export async function POST(req: Request) {
  const expected = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!expected || !secret) {
    return NextResponse.json(
      { error: 'เว็บยังไม่ได้ตั้งค่า SITE_PASSWORD/AUTH_SECRET ใน .env.local' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';

  if (!password || !timingSafeEqual(password, expected)) {
    return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 });
  }

  const token = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
