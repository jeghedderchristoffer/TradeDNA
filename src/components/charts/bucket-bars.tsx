import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Bucket } from '@/domain/metrics'
import { fmtMoney, fmtPct } from '@/lib/format'
import { ChartTip } from './chart-tooltip'
import { pnlColor, useChartTheme } from './chart-theme'
import { Empty } from './equity-chart'

/**
 * Vertical bars of P&L per bucket (day, weekday, hour, month...), colored by sign.
 * Rounded 4px at the data end, square at the baseline.
 */
export function BucketBars({
  buckets,
  height = 220,
  labelFormatter,
  onSelect,
}: {
  buckets: Bucket[]
  height?: number
  labelFormatter?: (key: string, label: string) => string
  onSelect?: (b: Bucket) => void
}) {
  const th = useChartTheme()
  if (!buckets.length) return <Empty height={height} />
  const fmtLabel = (b: Bucket) => (labelFormatter ? labelFormatter(b.key, b.label) : b.label)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={buckets}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid stroke={th.grid} vertical={false} />
        <XAxis
          dataKey="key"
          tickFormatter={(k: string) => {
            const b = buckets.find((x) => x.key === k)
            return b ? fmtLabel(b) : k
          }}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={{ stroke: th.axis }}
          tickLine={false}
          minTickGap={16}
        />
        <YAxis
          tickFormatter={(v: number) => fmtMoney(v, { compact: true })}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <ReferenceLine y={0} stroke={th.axis} />
        <Tooltip
          cursor={{ fill: th.grid, fillOpacity: 0.5 }}
          content={
            <ChartTip
              render={(d) => {
                const b = d as Bucket
                return {
                  title: fmtLabel(b),
                  rows: [
                    {
                      label: 'P&L',
                      value: fmtMoney(b.pnl, { sign: true }),
                      color: pnlColor(th, b.pnl),
                    },
                    { label: 'fees', value: fmtMoney(b.fees) },
                    { label: `trades · ${fmtPct(b.winRate, 0)} win`, value: String(b.count) },
                  ],
                }
              }}
            />
          }
        />
        <Bar
          dataKey="pnl"
          maxBarSize={24}
          isAnimationActive={false}
          onClick={(_, i) => {
            const b = buckets[i as number]
            if (b && onSelect) onSelect(b)
          }}
          cursor={onSelect ? 'pointer' : undefined}
        >
          {buckets.map((b) => (
            <Cell
              key={b.key}
              fill={pnlColor(th, b.pnl)}
              radius={(b.pnl >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]) as unknown as number}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
