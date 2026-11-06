import type { GroupAllocation } from '@/lib/portfolio';
import { fmtMoney } from '@/lib/format';
import { formatBand, hintLabel, STATUS_LABEL, statusTone } from '@/lib/bands';

/**
 * การ์ดสัดส่วนแบบอ่านภาพรวม
 * หมวด → สัดส่วนตอนนี้เทียบกรอบ → สถานะสั้น ๆ (เกินเป้า / ต่ำเป้า / พอดี)
 * แถบสีคือของจริง แถบจางคือกรอบเป้า
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

  const scale = Math.max(
    ...rows.map((g) => Math.max(g.actualPct, g.targetMax ?? 0, g.targetPct, 0)),
    1
  );
  const tally = { ok: 0, under: 0, over: 0 };
  for (const g of rows) tally[g.status] += 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
        <span className={`rounded-full border px-2 py-0.5 ${statusTone('ok')}`}>พอดี {tally.ok}</span>
        <span className={`rounded-full border px-2 py-0.5 ${statusTone('under')}`}>
          ต่ำเป้า {tally.under}
        </span>
        <span className={`rounded-full border px-2 py-0.5 ${statusTone('over')}`}>
          เกินเป้า {tally.over}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((g) => {
          const tone = statusTone(g.status);
          const gapTitle =
            g.status === 'ok' || Math.abs(g.actionAmount) < 1
              ? `อยู่ในกรอบ ${g.bandLabel}`
              : g.actionAmount > 0
                ? `อีกประมาณ ${fmtMoney(g.actionAmount, 0)} ${currency} ถึงขอบกรอบ`
                : `เกินกรอบประมาณ ${fmtMoney(Math.abs(g.actionAmount), 0)} ${currency}`;
          const groupHint = hintLabel(g.hint);
          return (
            <div key={g.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span className="truncate font-semibold text-forest">{g.label}</span>
                    {groupHint ? (
                      <span className="rounded-full border border-leaf bg-mist px-1.5 py-0.5 text-[10px] font-semibold text-forest/70">
                        {groupHint}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-forest/45">เป้า {g.bandLabel}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-base font-bold tabular-nums text-forest">
                    {g.actualPct.toFixed(1)}%
                  </span>
                  <span className={`badge border ${tone}`} title={gapTitle}>
                    {STATUS_LABEL[g.status]}
                  </span>
                </div>
              </div>

              <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-mist">
                {g.targetMin != null && g.targetMax != null && g.targetMax > g.targetMin ? (
                  <div
                    className="absolute inset-y-0 rounded-full bg-forest/10"
                    style={{
                      left: `${Math.min(100, (g.targetMin / scale) * 100)}%`,
                      width: `${Math.min(100, ((g.targetMax - g.targetMin) / scale) * 100)}%`,
                    }}
                  />
                ) : null}
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(100, (g.actualPct / scale) * 100)}%`,
                    background: g.color,
                  }}
                />
              </div>

              {g.members.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
                  {g.members.map((m) => {
                    const ownHint = m.hint && m.hint !== g.hint ? hintLabel(m.hint) : null;
                    const numTone =
                      m.status === 'over'
                        ? 'text-amber-700'
                        : m.status === 'under'
                          ? 'text-sky-700'
                          : 'text-forest/70';
                    return (
                      <span key={m.symbol} className="text-[11px] tabular-nums text-forest/50">
                        <span className="font-semibold text-forest/80">{m.symbol}</span>{' '}
                        <span className={numTone}>{m.actualPct.toFixed(1)}%</span>
                        <span className="text-forest/35">
                          {' '}
                          {formatBand(m.targetMin, m.targetMax, m.targetPct ?? 0)}
                        </span>
                        {ownHint ? <span className="ml-1 text-forest/40">{ownHint}</span> : null}
                      </span>
                    );
                  })}
                </div>
              ) : null}

              {g.isOther && g.heldSymbols.length > 0 ? (
                <div className="mt-1 text-[11px] text-forest/40">
                  นอกแผน: {g.heldSymbols.join(', ')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-forest/40">
        แถบสี = สัดส่วนตอนนี้ · พื้นจาง = กรอบเป้า · คิดจากพอร์ตรวมรวมเงินสด
      </p>
    </div>
  );
}
