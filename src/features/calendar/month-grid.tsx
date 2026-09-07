import { addDays, format, getDay, parseISO, startOfMonth, startOfWeek, endOfMonth } from 'date-fns'
import { useMemo } from 'react'
import { useChartTheme } from '@/components/charts/chart-theme'
import type { Bucket } from '@/domain/metrics'
import type { PnlBasis } from '@/domain/trade'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

/**
 * Month heatmap, Monday–Friday. Cell fill is a diverging ramp: loss ↔ neutral ↔ profit,
 * intensity scaled to the month's largest absolute day. Weekly totals in the last column.
 */
export function MonthGrid({
  month,
  days,
  basis,
  compact,
  selected,
  onSelect,
}: {
  /** 'YYYY-MM' */
  month: string
  days: Bucket[]
  basis: PnlBasis
  compact?: boolean
  selected?: string
  onSelect?: (dateKey: string) => void
}) {
  const th = useChartTheme()
  const byKey = useMemo(() => new Map(days.map((d) => [d.key, d])), [days])

  const first = startOfMonth(parseISO(`${month}-01`))
  const last = endOfMonth(first)
  const weeks: { days: (string | null)[]; pnl: number; fees: number; count: number }[] = []
  let cursor = startOfWeek(first, { weekStartsOn: 1 })
  while (cursor <= last) {
    const row: (string | null)[] = []
    let pnl = 0
    let fees = 0
    let count = 0
    for (let i = 0; i < 5; i++) {
      const d = addDays(cursor, i)
      const key = format(d, 'yyyy-MM-dd')
      const inMonth = d >= first && d <= last
      row.push(inMonth ? key : null)
      const b = inMonth ? byKey.get(key) : undefined
      if (b) {
        pnl += b.pnl
        fees += b.fees
        count += b.count
      }
    }
    weeks.push({ days: row, pnl, fees, count })
    cursor = addDays(cursor, 7)
  }

  const max = Math.max(
    1e-9,
    ...days.filter((d) => d.key.startsWith(month)).map((d) => Math.abs(d.pnl)),
  )
  const cellStyle = (b: Bucket | undefined) => {
    if (!b || b.pnl === 0) return undefined
    const alpha = 0.15 + 0.6 * Math.min(1, Math.abs(b.pnl) / max)
    return { background: hexA(b.pnl > 0 ? th.profit : th.loss, alpha) }
  }

  return (
    <div className="w-full">
      <div className={cn('grid gap-1', 'grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.9fr)]')}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] text-muted-foreground">
            {w}
          </div>
        ))}
        <div className="text-center text-[11px] text-muted-foreground">Week</div>
        {weeks.map((w, wi) => (
          <WeekRow
            key={wi}
            w={w}
            byKey={byKey}
            cellStyle={cellStyle}
            compact={compact}
            selected={selected}
            onSelect={onSelect}
            basis={basis}
          />
        ))}
      </div>
      {/* Weekend trades (rare: none for US equities) are still counted in weekly totals. */}
      {days.some((d) => d.key.startsWith(month) && [0, 6].includes(getDay(parseISO(d.key)))) && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Includes weekend-dated trades in weekly totals.
        </div>
      )}
    </div>
  )
}

function WeekRow({
  w,
  byKey,
  cellStyle,
  compact,
  selected,
  onSelect,
  basis,
}: {
  w: { days: (string | null)[]; pnl: number; fees: number; count: number }
  byKey: Map<string, Bucket>
  cellStyle: (b: Bucket | undefined) => React.CSSProperties | undefined
  compact?: boolean
  selected?: string
  onSelect?: (k: string) => void
  basis: PnlBasis
}) {
  return (
    <>
      {w.days.map((key, i) => {
        if (!key) return <div key={i} className={cn('rounded-md', compact ? 'h-12' : 'h-20')} />
        const b = byKey.get(key)
        const Cell = onSelect ? 'button' : 'div'
        return (
          <Cell
            key={key}
            type={onSelect ? 'button' : undefined}
            onClick={onSelect ? () => onSelect(key) : undefined}
            style={cellStyle(b)}
            title={
              b
                ? `${key}: ${fmtMoney(b.pnl, { sign: true })} ${basis} · ${b.count} trades · ${fmtMoney(b.fees)} fees`
                : key
            }
            className={cn(
              'flex flex-col rounded-md border p-1 text-left transition-colors',
              compact ? 'h-12' : 'h-20',
              b ? 'border-transparent' : 'border-border/60',
              onSelect && 'cursor-pointer hover:ring-2 hover:ring-ring/50',
              selected === key && 'ring-2 ring-ring',
            )}
          >
            <span className="text-[11px] leading-none text-muted-foreground">
              {Number(key.slice(8))}
            </span>
            {b && (
              <>
                <span
                  className={cn(
                    'mt-auto font-medium tabular leading-tight',
                    compact ? 'text-[11px]' : 'text-sm',
                  )}
                >
                  {fmtMoney(b.pnl, { sign: true, compact: true })}
                </span>
                {!compact && (
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {b.count} {b.count === 1 ? 'trade' : 'trades'} · {fmtMoney(b.fees)} fees
                  </span>
                )}
              </>
            )}
          </Cell>
        )
      })}
      <div
        className={cn(
          'flex flex-col justify-center rounded-md bg-muted/40 p-1 text-right',
          compact ? 'h-12' : 'h-20',
        )}
      >
        {w.count > 0 ? (
          <>
            <span
              className={cn(
                'font-medium tabular',
                compact ? 'text-[11px]' : 'text-sm',
                w.pnl > 0 ? 'text-profit' : w.pnl < 0 ? 'text-loss' : '',
              )}
            >
              {fmtMoney(w.pnl, { sign: true, compact: true })}
            </span>
            {!compact && (
              <span className="text-[11px] text-muted-foreground">
                {w.count} trades · {fmtMoney(w.fees)} fees
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </div>
    </>
  )
}

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
}
