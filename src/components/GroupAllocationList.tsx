import type { GroupAllocation } from '@/lib/portfolio';
import { fmtMoney } from '@/lib/format';

/**
 * สัดส่วนจริงเทียบเป้าหมาย รายหมวด (อ่านอย่างเดียว)
 * แถบสีคือสัดส่วนจริง เส้นดำคือตำแหน่งเป้าหมาย
 */
export default function GroupAllocationList({
  groups,
  currency,
  limit,
}: {
  groups: GroupAllocation[];
  currency: string;
  limit?: number;
}) {
  const rows = limit ? groups.slice(0, limit) : groups;
  if (!rows.length) return null;

  const max = Math.max(...rows.map((g) => Math.max(g.actualPct, g.targetPct)), 1);

  return (
    <div className="space-y-3">
      {rows.map((g) => {
        const over = g.diffPct > 0;
        const onTarget = Math.abs(g.actionAmount) < 1 || Math.abs(g.diffPct) < 0.5;
        return (
          <div key={g.key}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: g.color }}
                />
                <span className="truncate font-semibold text-forest">{g.label}</span>
                {g.symbols.length > 1 && (
                  <span className="hidden truncate text-[10px] text-forest/35 sm:inline">
                    {g.symbols.join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-forest/60">
                <b className="text-forest">{g.actualPct.toFixed(1)}%</b>
                <span className="text-forest/35"> / {g.targetPct}%</span>
              </span>
            </div>

            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-mist">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (g.actualPct / max) * 100)}%`,
                  background: g.color,
                }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-forest/70"
                style={{ left: `${Math.min(100, (g.targetPct / max) * 100)}%` }}
                title={`เป้าหมาย ${g.targetPct}%`}
              />
            </div>

            <div className="mt-1 text-xs">
              {onTarget ? (
                <span className="text-emerald-700">✓ ตรงเป้า</span>
              ) : over ? (
                <span className="text-amber-700">
                  เกินเป้า {g.diffPct.toFixed(1)}% — ควรลด {fmtMoney(Math.abs(g.actionAmount), 0)}{' '}
                  {currency}
                </span>
              ) : (
                <span className="text-forest/55">
                  ขาดอีก {Math.abs(g.diffPct).toFixed(1)}% — เติม{' '}
                  {fmtMoney(g.actionAmount, 0)} {currency}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
