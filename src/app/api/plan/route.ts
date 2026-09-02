import { buildInvestmentPlan } from '@/lib/planner';
import { getFxRate } from '@/lib/currency';
import { fail, handle, num, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * POST { portfolio_id, budget, budgetCurrency? }
 * budgetCurrency: 'THB' = แปลงเป็นสกุลพอร์ตให้ก่อนคำนวณ (ค่าเริ่มต้น = สกุลพอร์ต)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const pid = num(body.portfolio_id);
    const rawBudget = num(body.budget);
    if (!pid) return fail('ต้องระบุ portfolio_id');
    if (rawBudget === null || rawBudget <= 0) return fail('ใส่จำนวนเงินที่จะลงทุนก่อน');

    const wanted = String(body.budgetCurrency ?? '').toUpperCase().trim();

    // แปลงเงินเข้าสกุลของพอร์ตก่อน แล้วค่อยคำนวณทั้งหมดในสกุลเดียว
    let budget = rawBudget;
    let fxNote: string | null = null;
    if (wanted && wanted !== 'NATIVE') {
      // สร้างแผนเปล่าก่อนเพื่ออ่านสกุลพอร์ต (ถูกกว่าการเดา)
      const probe = await buildInvestmentPlan(pid, 0);
      if (!probe) return fail('ไม่พบพอร์ตนี้', 404);
      if (wanted !== probe.currency) {
        const rate = await getFxRate(wanted, probe.currency);
        if (rate === null) {
          return fail(`ดึงอัตราแลกเปลี่ยน ${wanted}→${probe.currency} ไม่ได้ ลองใหม่อีกครั้ง`, 502);
        }
        budget = rawBudget * rate;
        fxNote = `${rawBudget.toLocaleString()} ${wanted} ≈ ${budget.toFixed(2)} ${probe.currency} (1 ${wanted} = ${rate.toFixed(4)} ${probe.currency})`;
      }
    }

    const plan = await buildInvestmentPlan(pid, budget);
    if (!plan) return fail('ไม่พบพอร์ตนี้', 404);

    return ok({ ...plan, inputBudget: rawBudget, inputCurrency: wanted || plan.currency, fxNote });
  } catch (err) {
    return handle(err);
  }
}
