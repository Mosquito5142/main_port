import Link from "next/link";
import type { Position } from "@/lib/types";
import { fmtMoney, fmtPct, fmtQty, toneClass } from "@/lib/format";
import { hintLabel, STATUS_LABEL, statusTone, type BandStatus } from "@/lib/bands";

export default function PositionsTable({
  positions,
  showTarget = true,
  currency = "THB",
  cash,
  netWorth,
  cashBand = null,
}: {
  positions: Position[];
  showTarget?: boolean;
  currency?: string;
  /** ใส่แล้วจะโชว์แถวเงินสดต่อท้ายตาราง — ไม่ใส่ก็ไม่มีผลอะไรกับเดิม */
  cash?: number;
  /** พอร์ต + เงินสดรวม ใช้คิด % ของแถวเงินสด */
  netWorth?: number;
  /** กรอบของหมวดเงินสดสำรอง ถ้ามี จะโชว์ในแถวเงินสด */
  cashBand?: { label: string; status: BandStatus } | null;
}) {
  return (
    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th>หุ้น</th>
            <th className="num">จำนวน</th>
            <th className="num">ต้นทุนเฉลี่ย</th>
            <th className="num">ราคาล่าสุด</th>
            <th className="num">มูลค่า</th>
            <th className="num">กำไร/ขาดทุน</th>
            <th className="num">สัดส่วน</th>
            {showTarget && <th className="num">เป้าหมาย</th>}
            {showTarget && <th className="num">ต้องทำ</th>}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.stock_id}>
              <td>
                <Link
                  href={`/stocks/${encodeURIComponent(p.symbol)}`}
                  className="group flex flex-col leading-tight"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-forest group-hover:underline">
                      {p.symbol}
                    </span>
                    {p.isCore && (
                      <span className="rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700 border border-blue-200" title="หมวด Core">
                        Core
                      </span>
                    )}
                  </div>
                  <span className="max-w-[220px] truncate text-xs text-forest/50">
                    {p.name ?? "—"}
                  </span>
                </Link>
              </td>
              <td className="num">{fmtQty(p.quantity)}</td>
              <td className="num">
                {p.quantity > 0 ? fmtMoney(p.avgCost) : "—"}
              </td>
              <td className="num">
                <div className="flex flex-col items-end leading-tight">
                  <span className="font-semibold">{fmtMoney(p.price)}</span>
                  <span className={`text-[11px] ${toneClass(p.changePercent)}`}>
                    {fmtPct(p.changePercent)}
                  </span>
                </div>
              </td>
              <td className="num font-semibold">{fmtMoney(p.marketValue)}</td>
              <td className={`num font-semibold ${toneClass(p.unrealizedPnl)}`}>
                <div className="flex flex-col items-end leading-tight">
                  <span>{fmtMoney(p.unrealizedPnl)}</span>
                  <span className="text-[11px]">{fmtPct(p.unrealizedPct)}</span>
                </div>
              </td>
              <td className="num">
                <div className="flex items-center justify-end gap-2">
                  <span
                    className="w-14 text-right font-semibold"
                    title="สัดส่วนของพอร์ตรวม รวมเงินสด"
                  >
                    {(p.portPct ?? p.weight).toFixed(1)}%
                  </span>
                  <span className="meter hidden w-16 sm:block">
                    <span style={{ width: `${Math.min(100, p.portPct ?? p.weight)}%` }} />
                  </span>
                </div>
              </td>
              {showTarget && (
                <td className="num">
                  {p.targetLabel ? (
                    <span className="font-semibold tabular-nums">{p.targetLabel}</span>
                  ) : p.targetPercent === null ? (
                    <span className="text-forest/30">—</span>
                  ) : (
                    <span className="font-semibold tabular-nums">
                      {p.targetPercent.toFixed(1)}%
                    </span>
                  )}
                </td>
              )}
              {showTarget && (
                <td className="num">
                  {p.bandStatus ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`badge border ${statusTone(p.bandStatus)}`}>
                        {STATUS_LABEL[p.bandStatus]}
                      </span>
                      {p.bandStatus === "under" &&
                      (p.hint === "no_new" || p.hint === "wait_earn") ? (
                        <span className="text-[10px] text-forest/45">
                          {hintLabel(p.hint)}
                        </span>
                      ) : p.bandStatus !== "ok" && Math.abs(p.actionAmount) >= 1 ? (
                        <span className="text-[10px] tabular-nums text-forest/45">
                          {fmtMoney(Math.abs(p.actionAmount), 0)} {currency}
                        </span>
                      ) : null}
                    </div>
                  ) : Math.abs(p.actionAmount) < 1 || p.targetPercent === null ? (
                    <span className="badge-green">พอดี</span>
                  ) : p.actionAmount > 0 ? (
                    <span className="badge border border-sky-200 bg-sky-50 text-sky-800">
                      ต่ำเป้า
                    </span>
                  ) : (
                    <span className="badge border border-amber-200 bg-amber-50 text-amber-800">
                      เกินเป้า
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {cash !== undefined && (
          <tfoot>
            <tr className="border-t-2 border-leaf/60 bg-mist/40">
              <td className="font-bold text-forest">💵 เงินสด</td>
              <td className="num text-forest/30">—</td>
              <td className="num text-forest/30">—</td>
              <td className="num text-forest/30">—</td>
              <td className="num font-semibold">{fmtMoney(cash)}</td>
              <td className="num text-forest/30">—</td>
              <td className="num">
                {netWorth ? (
                  <span
                    className="font-semibold"
                    title="สัดส่วนของพอร์ตรวม รวมเงินสด — ฐานเดียวกับคอลัมน์สัดส่วนของหุ้น"
                  >
                    {((cash / netWorth) * 100).toFixed(2)}%
                  </span>
                ) : (
                  "—"
                )}
              </td>
              {showTarget && (
                <td className="num">
                  {cashBand ? (
                    <span className="font-semibold tabular-nums">{cashBand.label}</span>
                  ) : (
                    <span className="text-forest/30">—</span>
                  )}
                </td>
              )}
              {showTarget && (
                <td className="num">
                  {cashBand ? (
                    <span className={`badge border ${statusTone(cashBand.status)}`}>
                      {STATUS_LABEL[cashBand.status]}
                    </span>
                  ) : (
                    <span className="text-forest/30">—</span>
                  )}
                </td>
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
