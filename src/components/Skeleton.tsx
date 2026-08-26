/** โครงหน้าเปล่าระหว่างโหลด — ให้กดแล้วเห็นการตอบสนองทันที ไม่ต้องรอ server render เสร็จ */

export function Shimmer({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`animate-pulse rounded-xl bg-gradient-to-r from-leaf/25 via-mist to-leaf/25 ${className}`}
    />
  );
}

export function StatSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="mt-3 h-7 w-32" />
          <Shimmer className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="table-wrap p-4">
      <Shimmer className="h-4 w-full" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Shimmer key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="card card-pad">
      <Shimmer className="h-4 w-40" />
      <Shimmer className="mt-4 w-full" style={{ height }} />
    </div>
  );
}

export function PageSkeleton({
  emoji = '🌱',
  title,
  stats = 5,
  chart = false,
  rows = 6,
}: {
  emoji?: string;
  title: string;
  stats?: number;
  chart?: boolean;
  rows?: number;
}) {
  return (
    <>
      <header className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-forest sm:text-3xl">
          <span className="text-3xl">{emoji}</span>
          {title}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-forest/45">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-leaf border-t-forest" />
          กำลังดึงราคาล่าสุด…
        </div>
      </header>
      {stats > 0 && <StatSkeleton count={stats} />}
      {chart && (
        <div className="mb-6">
          <ChartSkeleton />
        </div>
      )}
      <TableSkeleton rows={rows} />
    </>
  );
}
