import { Shimmer } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <header className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-forest sm:text-3xl">
          <span className="text-3xl">🧺</span>
          พอร์ตของฉัน
        </h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-forest/45">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-leaf border-t-forest" />
          กำลังคำนวณมูลค่าพอร์ต…
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card card-pad">
            <div className="flex items-start gap-3">
              <Shimmer className="h-9 w-9 shrink-0" />
              <div className="flex-1">
                <Shimmer className="h-5 w-32" />
                <Shimmer className="mt-2 h-4 w-20" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Shimmer key={j} className="h-14 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
