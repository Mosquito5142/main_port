import 'server-only';
import { cookies } from 'next/headers';

export const THEME_COOKIE = 'gp_theme';
export const SUPPORTED_THEME = ['light', 'dark'] as const;
export type ThemeMode = (typeof SUPPORTED_THEME)[number];

/** อ่านโหมดธีมจากคุกกี้ (ตั้งจาก ThemeToggle) — ค่าเริ่มต้นคือ 'light' (ธีมเดิมของเว็บ) */
export async function readTheme(): Promise<ThemeMode> {
  const jar = await cookies();
  const raw = jar.get(THEME_COOKIE)?.value;
  return SUPPORTED_THEME.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'light';
}
