import { PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return <PageSkeleton emoji="🧮" title="คำนวณถัวเฉลี่ย & สัดส่วน" stats={0} chart rows={5} />;
}
