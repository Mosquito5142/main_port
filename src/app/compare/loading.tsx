import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="⚖️" title="เทียบแผนพอร์ต" stats={0} chart rows={3} />;
}
