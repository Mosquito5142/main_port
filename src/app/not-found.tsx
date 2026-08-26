import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-6xl">🌾</div>
      <h1 className="text-2xl font-extrabold text-forest">ไม่พบหน้านี้</h1>
      <p className="text-sm text-forest/60">ลิงก์อาจเปลี่ยนไป หรือข้อมูลถูกลบไปแล้ว</p>
      <Link href="/" className="btn-primary mt-2">
        ← กลับหน้าภาพรวม
      </Link>
    </div>
  );
}
