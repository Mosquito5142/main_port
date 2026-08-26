'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { fmtMoney } from '@/lib/format';
import { useIsDark } from '@/lib/useIsDark';

const PALETTE = [
  '#1B5E20',
  '#2E7D32',
  '#43A047',
  '#66BB6A',
  '#81C784',
  '#A5D6A7',
  '#C8E6C9',
  '#7CB342',
  '#33691E',
  '#9CCC65',
];

export interface Slice {
  name: string;
  value: number;
  target?: number | null;
}

export default function AllocationChart({
  data,
  height = 260,
  innerRadius = 62,
  outerRadius = 100,
}: {
  data: Slice[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const dark = useIsDark();
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((a, b) => a + b.value, 0);

  if (!rows.length)
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-forest/40">
        ยังไม่มีข้อมูลสัดส่วน
      </div>
    );

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke={dark ? '#141C16' : '#ffffff'}
            strokeWidth={2}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: dark ? '1px solid #3E5C40' : '1px solid #A5D6A7',
              background: dark ? 'rgba(20,28,22,.96)' : 'rgba(255,255,255,.96)',
              fontSize: 12,
            }}
            formatter={(v: any, n: any) => [
              `${fmtMoney(Number(v))} (${total ? ((Number(v) / total) * 100).toFixed(2) : 0}%)`,
              n,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export { PALETTE };
