import Link from "next/link";
import type { Position } from "@/lib/types";
import { fmtMoney, fmtPct, fmtQty, toneClass } from "@/lib/format";

export default function PositionsTable({
  positions,
  showTarget = true,
  currency = "THB",
}: {
  positions: Position[];
  showTarget?: boolean;
  currency?: string;
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
                  <span className="font-bold text-forest group-hover:underline">
                    {p.symbol}
                  </span>
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
                  <span className="w-14 text-right font-semibold">
                    {p.weight.toFixed(2)}%
                  </span>
                  <span className="meter hidden w-16 sm:block">
                    <span style={{ width: `${Math.min(100, p.weight)}%` }} />
                  </span>
                </div>
              </td>
              {showTarget && (
                <td className="num">
                  {p.targetPercent === null ? (
                    <span className="text-forest/30">—</span>
                  ) : (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-semibold">
                        {p.targetPercent.toFixed(2)}%
                      </span>
                      <span
                        className={`text-[11px] ${toneClass(p.diffPercent)}`}
                      >
                        {fmtPct(p.diffPercent)}
                      </span>
                    </div>
                  )}
                </td>
              )}
              {showTarget && (
                <td className="num">
                  {p.targetPercent === null || Math.abs(p.actionAmount) < 1 ? (
                    <span className="badge-green">สมดุล</span>
                  ) : p.actionAmount > 0 ? (
                    <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ซื้อเพิ่ม {fmtMoney(p.actionAmount, 0)} {currency}
                    </span>
                  ) : (
                    <span className="badge bg-amber-50 text-amber-800 border border-amber-200">
                      ลด {fmtMoney(Math.abs(p.actionAmount), 0)} {currency}
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
