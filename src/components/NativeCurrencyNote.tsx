import { readDisplayCurrency } from '@/lib/currency';

/**
 * เตือนว่าหน้านี้ยังใช้สกุลเงินจริงอยู่ แม้จะเปิดโหมดดูเป็นเงินบาท
 * ใช้กับหน้าที่มีช่องกรอกราคา หรือหน้าที่เป็นราคาต่อหุ้นล้วน ๆ
 * (ถ้าแปลงด้วย เวลากรอกราคาจะสับสนและบันทึกผิดสกุล)
 */
export default async function NativeCurrencyNote({ reason }: { reason: string }) {
  const want = await readDisplayCurrency();
  if (want === 'NATIVE') return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      💱 หน้านี้แสดง<b>ราคาตามสกุลเงินจริงของหุ้น</b> (ไม่แปลงเป็น {want}) — {reason}
    </div>
  );
}
