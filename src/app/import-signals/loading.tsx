import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="📋" title="นำเข้าโพย" stats={0} rows={6} />;
}
