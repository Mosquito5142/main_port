'use client';

import RouteError from '@/components/RouteError';

// error.tsx ที่ root — ดักปัญหาระดับ layout เอง (เช่น Sidebar พังจนหน้าไหนก็เปิดไม่ได้เลย)
// หน้าปกติจะถูกดักด้วย error.tsx ของแต่ละ route segment ก่อน (ดู src/components/RouteError.tsx)
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} pageLabel="เว็บ GreenPort" />;
}
