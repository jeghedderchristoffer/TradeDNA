import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EquityPoint } from '@/domain/metrics'
import type { PnlBasis } from '@/domain/trade'
import { fmtDateKey, fmtMoney } from '@/lib/format'
import { ChartTip } from './chart-tooltip'
import { useChartTheme } from './chart-theme'

/** Cumulative gross vs net P&L. The gap between the lines is fees. */
export function EquityChart({
  points,
  basis,
  height = 260,
}: {
  points: EquityPoint[]
  basis: PnlBasis
  height?: number
}) {
  const th = useChartTheme()
  if (!points.length) return <Empty height={height} />
  const data = points.map((p, i) => ({ ...p, i }))
  const netColor = th.series[0]!
  const grossColor = th.neutral
  const netStrong = basis === 'net'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={th.grid} vertical={false} />
        <XAxis
          dataKey="i"
          tickFormatter={(i: number) => fmtDateKey(data[i]?.date ?? '2000-01-01', 'MMM d')}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={{ stroke: th.axis }}
          tickLine={false}
          minTickGap={40}
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
          cursor={{ stroke: th.axis }}
          content={
            <ChartTip
              render={(d) => {
                const p = d as EquityPoint
                return {
                  title: `${fmtDateKey(p.date)} · after trade`,
                  rows: [
                    {
                      label: 'Net cumulative',
                      value: fmtMoney(p.net, { sign: true }),
                      color: netColor,
                    },
                    {
                      label: 'Gross cumulative',
                      value: fmtMoney(p.gross, { sign: true }),
                      color: grossColor,
                    },
                    { label: 'Fees so far', value: fmtMoney(p.fees) },
                  ],
                }
              }}
            />
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="plainline"
          wrapperStyle={{ fontSize: 11, color: th.muted }}
        />
        <Line
          type="monotone"
          dataKey="gross"
          name="Gross"
          stroke={grossColor}
          strokeWidth={netStrong ? 1.5 : 2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: th.surface }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Net"
          stroke={netColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: th.surface }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function Empty({
  height,
  text = 'No closed trades in this range',
}: {
  height: number
  text?: string
}) {
  return (
    <div
      className="flex items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      {text}
    </div>
  )
}
