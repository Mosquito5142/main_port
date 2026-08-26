import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="🌱" title="ภาพรวมพอร์ต" stats={5} chart rows={6} />;
}
