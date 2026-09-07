import { Segmented } from '@/components/ui/segmented'
import { PRESETS, useRange } from './range-store'

/** One filter row above everything it scopes. Date range first. */
export function RangeFilter({ right }: { right?: React.ReactNode }) {
  const [range, setRange] = useRange()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        options={[...PRESETS, { value: 'custom' as const, label: 'Custom' }]}
        value={range.preset}
        onChange={(preset) => setRange({ ...range, preset })}
      />
      {range.preset === 'custom' && (
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={range.from ?? ''}
            onChange={(e) => setRange({ ...range, from: e.target.value || undefined })}
            className="h-8 rounded-md border bg-background px-2"
            aria-label="From"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={range.to ?? ''}
            onChange={(e) => setRange({ ...range, to: e.target.value || undefined })}
            className="h-8 rounded-md border bg-background px-2"
            aria-label="To"
          />
        </div>
      )}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  )
}
