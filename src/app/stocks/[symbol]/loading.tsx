import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="📈" title="กำลังโหลดข้อมูลหุ้น" stats={5} chart rows={5} />;
}
