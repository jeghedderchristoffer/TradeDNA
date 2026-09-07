import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthCosts } from '@/domain/metrics'
import { fmtMoney, fmtMonthKey } from '@/lib/format'
import { ChartTip } from './chart-tooltip'
import { useChartTheme } from './chart-theme'
import { Empty } from './equity-chart'

/** Fixed series order and hue slots: identity never depends on which months have data. */
const SERIES: { key: keyof MonthCosts; label: string; slot: number }[] = [
  { key: 'trading', label: 'Commissions & fees', slot: 0 },
  { key: 'locate', label: 'Locates (used)', slot: 1 },
  { key: 'borrow', label: 'Overnight borrow', slot: 2 },
  { key: 'unusedLocates', label: 'Locates (unused)', slot: 3 },
  { key: 'software', label: 'Software & data', slot: 4 },
  { key: 'other', label: 'Other', slot: 6 },
]

/** Stacked cost per month by category. */
export function CostBars({ months, height = 260 }: { months: MonthCosts[]; height?: number }) {
  const th = useChartTheme()
  if (!months.length) return <Empty height={height} text="No costs in this range" />
  const active = SERIES.filter((s) => months.some((m) => Math.abs(m[s.key] as number) > 0.005))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={months}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid stroke={th.grid} vertical={false} />
        <XAxis
          dataKey="key"
          tickFormatter={(k: string) =>
            fmtMonthKey(k).slice(0, 3) + (k.endsWith('-01') ? ` ${k.slice(2, 4)}` : '')
          }
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={{ stroke: th.axis }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => fmtMoney(v, { compact: true })}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          cursor={{ fill: th.grid, fillOpacity: 0.5 }}
          content={
            <ChartTip
              render={(d) => {
                const m = d as MonthCosts
                return {
                  title: fmtMonthKey(m.key),
                  rows: [
                    ...active
                      .filter((s) => Math.abs(m[s.key] as number) > 0.005)
                      .map((s) => ({
                        label: s.label,
                        value: fmtMoney(m[s.key] as number),
                        color: th.series[s.slot]!,
                      })),
                    { label: 'total costs', value: fmtMoney(m.total) },
                    { label: 'gross P&L', value: fmtMoney(m.grossPnl, { sign: true }) },
                    { label: 'bottom line', value: fmtMoney(m.bottomLine, { sign: true }) },
                  ],
                }
              }}
            />
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: th.muted }}
        />
        {active.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="cost"
            fill={th.series[s.slot]!}
            stroke={th.surface}
            strokeWidth={1}
            maxBarSize={28}
            isAnimationActive={false}
            radius={i === active.length - 1 ? ([4, 4, 0, 0] as unknown as number) : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
