import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="🧾" title="บันทึกซื้อขาย" stats={0} chart rows={8} />;
}
