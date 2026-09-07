import type { ReactNode } from 'react'

export interface TipRow {
  label: string
  value: string
  color?: string
}

export interface ChartTipProps {
  active?: boolean
  label?: unknown
  payload?: ReadonlyArray<{ payload?: unknown }>
  /** Build the rows from the hovered datum. */
  render?: (datum: unknown, label: unknown) => { title?: ReactNode; rows: TipRow[] } | null
}

/** Shared tooltip: value leads, label follows, series keyed by a short colored stroke. */
export function ChartTip({ active, label, payload, render }: ChartTipProps) {
  if (!active || !payload?.length || !render) return null
  const datum = payload[0]?.payload
  const content = render(datum, label)
  if (!content) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {content.title && <div className="mb-1 font-medium">{content.title}</div>}
      <div className="space-y-0.5">
        {content.rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.color && (
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
            )}
            <span className="font-semibold tabular">{r.value}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
