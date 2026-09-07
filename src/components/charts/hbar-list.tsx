import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChartTheme } from './chart-theme'

export interface HBarItem {
  key: string
  label: string
  value: number
  /** Secondary text at the right of the label, e.g. trade count. */
  meta?: string
}

/**
 * Single-series horizontal bars rendered in plain HTML: one color, value at the tip,
 * label in text ink. Good for fee types, symbols, any nominal ranking.
 */
export function HBarList({
  items,
  color,
  signed = false,
  formatValue = (v) => fmtMoney(v, { sign: signed }),
  onSelect,
  className,
}: {
  items: HBarItem[]
  /** Fixed hue for the series; when `signed`, profit/loss colors are used instead. */
  color?: string
  signed?: boolean
  formatValue?: (v: number) => string
  onSelect?: (item: HBarItem) => void
  className?: string
}) {
  const th = useChartTheme()
  const max = Math.max(1e-9, ...items.map((i) => Math.abs(i.value)))
  const fill = color ?? th.series[0]!
  if (!items.length)
    return <div className="py-6 text-center text-sm text-muted-foreground">Nothing to show</div>
  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((it) => {
        const pct = (Math.abs(it.value) / max) * 100
        const c = signed ? (it.value > 0 ? th.profit : it.value < 0 ? th.loss : th.neutral) : fill
        const Row = onSelect ? 'button' : 'div'
        return (
          <li key={it.key}>
            <Row
              type={onSelect ? 'button' : undefined}
              onClick={onSelect ? () => onSelect(it) : undefined}
              className={cn(
                'grid w-full grid-cols-[minmax(64px,1fr)_3fr_auto] items-center gap-3 rounded-md px-1 py-0.5 text-left text-xs',
                onSelect && 'hover:bg-muted/60 cursor-pointer',
              )}
              title={`${it.label}: ${formatValue(it.value)}`}
            >
              <span className="truncate font-medium">
                {it.label}
                {it.meta && (
                  <span className="ml-1.5 font-normal text-muted-foreground">{it.meta}</span>
                )}
              </span>
              <span className="relative h-3 rounded-sm bg-muted/60">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-sm"
                  style={{ width: `${pct}%`, background: c }}
                />
              </span>
              <span className="tabular text-right w-20">{formatValue(it.value)}</span>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}
