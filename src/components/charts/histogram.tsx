import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HistogramBin } from '@/domain/metrics'
import { fmtMoney } from '@/lib/format'
import { ChartTip } from './chart-tooltip'
import { pnlColor, useChartTheme } from './chart-theme'
import { Empty } from './equity-chart'

/** Trade count per P&L bin; bars colored by the sign of the bin. */
export function Histogram({ bins, height = 220 }: { bins: HistogramBin[]; height?: number }) {
  const th = useChartTheme()
  if (!bins.length) return <Empty height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="15%">
        <CartesianGrid stroke={th.grid} vertical={false} />
        <XAxis
          dataKey="key"
          tickFormatter={(k: string) => fmtMoney(Number(k), { compact: true }).replace('.00', '')}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={{ stroke: th.axis }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          cursor={{ fill: th.grid, fillOpacity: 0.5 }}
          content={
            <ChartTip
              render={(d) => {
                const b = d as HistogramBin
                return {
                  title: `${fmtMoney(b.from)} to ${fmtMoney(b.to)}`,
                  rows: [
                    { label: b.count === 1 ? 'trade' : 'trades', value: String(b.count) },
                    {
                      label: 'total in bin',
                      value: fmtMoney(b.pnl, { sign: true }),
                      color: pnlColor(th, b.pnl),
                    },
                  ],
                }
              }}
            />
          }
        />
        <Bar
          dataKey="count"
          maxBarSize={32}
          isAnimationActive={false}
          radius={[4, 4, 0, 0] as unknown as number}
        >
          {bins.map((b) => (
            <Cell key={b.key} fill={b.to <= 0 ? th.loss : b.from >= 0 ? th.profit : th.neutral} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
