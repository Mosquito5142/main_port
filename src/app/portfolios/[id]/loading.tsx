import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="🌳" title="กำลังเปิดพอร์ต" stats={5} chart rows={8} />;
}
