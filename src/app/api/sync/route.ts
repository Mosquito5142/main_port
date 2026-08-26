import { syncFromTurso } from '@/lib/sync';
import { fetchTursoLastSync, tursoConfigured } from '@/lib/turso';
import { handle, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    if (!tursoConfigured()) return fail('ยังไม่ได้ตั้งค่า Turso ใน .env.local', 400);
    return ok({ lastSync: await fetchTursoLastSync() });
  } catch (err) {
    return handle(err);
  }
}

export async function POST() {
  try {
    if (!tursoConfigured()) return fail('ยังไม่ได้ตั้งค่า Turso ใน .env.local', 400);
    return ok(await syncFromTurso());
  } catch (err) {
    return handle(err);
  }
}
