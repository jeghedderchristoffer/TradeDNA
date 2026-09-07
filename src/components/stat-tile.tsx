import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** label · value · optional sub line. Proportional figures on the value (not tabular). */
export function StatTile({
  label,
  value,
  sub,
  tone,
  className,
  hero,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'profit' | 'loss' | 'fee' | 'neutral'
  className?: string
  hero?: boolean
}) {
  const toneCls =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'fee'
          ? 'text-fee'
          : ''
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 font-semibold tracking-tight',
          hero ? 'text-4xl sm:text-5xl' : 'text-xl',
          toneCls,
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
