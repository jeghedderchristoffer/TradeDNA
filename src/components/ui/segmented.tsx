import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'sm',
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center rounded-lg bg-muted p-0.5 text-muted-foreground',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors cursor-pointer',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            o.value === value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
