import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { IntradayPoint } from '@/domain/metrics'
import { fmtMoney } from '@/lib/format'
import { ChartTip } from './chart-tooltip'
import { useChartTheme } from './chart-theme'
import { Empty } from './equity-chart'

/** Average cumulative P&L through the trading day. Single series, so no legend. */
export function IntradayChart({
  points,
  height = 240,
}: {
  points: IntradayPoint[]
  height?: number
}) {
  const th = useChartTheme()
  if (!points.some((p) => p.trades > 0)) return <Empty height={height} />
  // trim the flat tails so the plot shows where trading actually happens
  const first = Math.max(0, points.findIndex((p) => p.trades > 0) - 1)
  let last = points.length - 1
  while (last > 0 && points[last]!.trades === 0) last--
  const data = points.slice(first, Math.min(points.length, last + 2))
  const color = th.series[0]!
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="intraday-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={th.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={{ stroke: th.axis }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={(v: number) => fmtMoney(v, { compact: true })}
          tick={{ fill: th.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <ReferenceLine y={0} stroke={th.axis} />
        <ReferenceLine
          x="09:30"
          stroke={th.axis}
          strokeDasharray="0"
          label={{ value: 'open', fill: th.muted, fontSize: 10, position: 'insideTopLeft' }}
        />
        <ReferenceLine
          x="16:00"
          stroke={th.axis}
          label={{ value: 'close', fill: th.muted, fontSize: 10, position: 'insideTopLeft' }}
        />
        <Tooltip
          cursor={{ stroke: th.axis }}
          content={
            <ChartTip
              render={(d) => {
                const p = d as IntradayPoint
                return {
                  title: `by ${p.label}`,
                  rows: [
                    {
                      label: 'avg cumulative P&L per day',
                      value: fmtMoney(p.avgCum, { sign: true }),
                      color,
                    },
                    {
                      label: `realized in this slot · ${p.trades} trades`,
                      value: fmtMoney(p.slotPnl, { sign: true }),
                    },
                  ],
                }
              }}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="avgCum"
          stroke={color}
          strokeWidth={2}
          fill="url(#intraday-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: th.surface }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
