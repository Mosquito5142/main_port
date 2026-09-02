import { buildInvestmentPlan } from '@/lib/planner';
import { fail, handle, num, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * ให้ Gemini อ่าน "แผนที่โค้ดคำนวณไว้แล้ว" แล้วสรุป/ทักท้วงเป็นภาษาไทย
 *
 * ตั้งใจไม่ให้ AI คิดเลขหรือเลือกหุ้นเอง — ตัวเลขทั้งหมดมาจาก buildInvestmentPlan()
 * AI เห็นแค่ผลลัพธ์ แล้วทำหน้าที่อธิบาย/เตือนจุดที่ควรระวังเท่านั้น
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return fail('ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env.local', 501);
    }

    const body = await req.json().catch(() => ({}));
    const pid = num(body.portfolio_id);
    const budget = num(body.budget);
    if (!pid || budget === null || budget <= 0) return fail('ต้องระบุ portfolio_id และ budget');

    const plan = await buildInvestmentPlan(pid, budget);
    if (!plan) return fail('ไม่พบพอร์ตนี้', 404);
    if (!plan.buys.length) return fail('แผนนี้ยังไม่มีรายการซื้อให้วิเคราะห์');

    const f = (n: number) => n.toFixed(2);
    const lines = plan.buys
      .map(
        (b) =>
          `- ${b.symbol} (หมวด ${b.groupLabel}): ลง ${f(b.amount)} ${plan.currency} @ ${f(b.price)} ` +
          `= ${b.quantity.toFixed(4)} หุ้น | ` +
          (b.currentAvgCost
            ? `ต้นทุนเดิม ${f(b.currentAvgCost)} → ใหม่ ${f(b.newAvgCost)} (${b.avgCostChangePct! >= 0 ? '+' : ''}${f(b.avgCostChangePct!)}%), ราคาตอนนี้ห่างทุน ${f(b.vsAvgCostPct!)}%`
            : 'ตัวใหม่ ยังไม่เคยถือ') +
          (b.nearestSupport
            ? ` | แนวรับใกล้สุด ${f(b.nearestSupport)} (ห่าง ${f(b.supportDistancePct!)}%)`
            : ' | ไม่มีแนวรับบันทึกไว้')
      )
      .join('\n');

    const groupLines = plan.groups
      .map(
        (g) =>
          `- ${g.label}: เป้า ${f(g.targetPct)}% | ตอนนี้ ${f(g.actualPctNow)}% → หลังลง ${f(g.actualPctAfter)}%`
      )
      .join('\n');

    const prompt = `คุณเป็นผู้ช่วยทบทวนแผนจัดพอร์ตลงทุน ผู้ใช้เป็นเจ้าของพอร์ตนี้และตั้งสัดส่วนเป้าหมายไว้เอง

แผนด้านล่างคำนวณมาแล้วด้วยสูตร rebalance (เติมเงินเข้าหมวดที่ห่างจากเป้าที่ผู้ใช้ตั้งไว้มากที่สุดก่อน)
งานของคุณคือ "ทบทวนและอธิบาย" แผนนี้ ไม่ใช่คิดเลขใหม่หรือเปลี่ยนตัวเลข

เงินที่จะลงเดือนนี้: ${f(plan.budget)} ${plan.currency}
มูลค่าหุ้นตอนนี้: ${f(plan.totals.marketValueNow)} | เงินสด: ${f(plan.totals.cash)}

สัดส่วนรายหมวด:
${groupLines}

รายการที่แผนแนะนำ:
${lines}

ตอบเป็น JSON ล้วน ๆ ไม่ต้องมี markdown:
{
  "summary": "สรุปภาพรวมแผนนี้ 2-3 ประโยค เป็นภาษาไทย",
  "watchouts": ["ข้อควรระวัง 2-4 ข้อ เป็นภาษาไทย เช่น ตัวที่กระจุกตัวมากไป ตัวที่ราคายังห่างแนวรับ ตัวที่ซื้อแล้วต้นทุนเฉลี่ยสูงขึ้น"],
  "notes": "ข้อสังเกตเพิ่มเติมสั้น ๆ 1-2 ประโยค เป็นภาษาไทย"
}`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return fail('โควตา Gemini เต็มชั่วคราว รอสักครู่แล้วลองใหม่', 429);
      }
      return fail(`Gemini ตอบกลับผิดพลาด (${aiRes.status})`, 502);
    }

    const data = await aiRes.json();
    const raw: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return fail('Gemini ไม่ได้ส่งข้อความกลับมา', 502);

    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: { summary?: string; watchouts?: string[]; notes?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // เผื่อ Gemini ตอบไม่เป็น JSON — ส่งข้อความดิบกลับไปดีกว่าพัง
      return ok({ summary: cleaned, watchouts: [], notes: '' });
    }

    return ok({
      summary: parsed.summary ?? '',
      watchouts: Array.isArray(parsed.watchouts) ? parsed.watchouts : [],
      notes: parsed.notes ?? '',
    });
  } catch (err) {
    return handle(err);
  }
}
