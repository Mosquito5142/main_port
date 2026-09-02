import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="🧭" title="วางแผนลงเงิน" stats={0} rows={6} />;
}
