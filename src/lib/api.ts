import { NextResponse } from 'next/server';

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handle(err: unknown) {
  const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
  console.error('[api]', err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function num(v: unknown, fallback: number | null = null): number | null {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

export function normalizeSymbol(v: unknown): string | null {
  const s = str(v);
  return s ? s.toUpperCase().replace(/\s+/g, '') : null;
}
