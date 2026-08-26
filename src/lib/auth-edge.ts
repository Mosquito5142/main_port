import 'server-only';

// ใช้ Web Crypto API (crypto.subtle) ล้วน ๆ เพราะไฟล์นี้ต้องรันได้ทั้งใน
// Edge middleware (ไม่มี Node 'crypto'/Buffer เต็มรูปแบบ) และใน API route (Node runtime)

export const AUTH_COOKIE = 'gp_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 วัน (วินาที)

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toHex(sig);
}

/** เทียบสตริงแบบ constant-time กัน timing attack (ยาวไม่เท่ากันถือว่าไม่ตรงทันที) */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** สร้าง session token ใหม่หลังล็อกอินสำเร็จ — รูปแบบ "expiresAtMs.signature" */
export async function createSessionToken(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const sig = await hmac(secret, String(expires));
  return `${expires}.${sig}`;
}

/** ตรวจ session token จากคุกกี้ — คืน true เฉพาะลายเซ็นตรงและยังไม่หมดอายุ */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiresStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = await hmac(secret, expiresStr);
  return timingSafeEqual(expected, sig);
}
