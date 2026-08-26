import { getFxRate } from '@/lib/currency';
import { fail, handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** อัตราแลกเปลี่ยนสด ๆ ให้ client เรียกใช้ตรง ๆ — เช่นตอนกรอกจำนวนเงินเป็นบาทในหน้าคำนวณ */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = sp.get('from');
    const to = sp.get('to');
    if (!from || !to) return fail('ต้องระบุ from และ to');

    const rate = await getFxRate(from, to);
    if (rate === null) return fail(`ดึงอัตราแลกเปลี่ยน ${from}→${to} ไม่ได้`, 502);

    return ok({ from: from.toUpperCase(), to: to.toUpperCase(), rate });
  } catch (err) {
    return handle(err);
  }
}
