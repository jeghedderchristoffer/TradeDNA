import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  )
}

/**
 * Page-shaped placeholder shown while IndexedDB is being read and trades are matched.
 * Mirrors the real layouts (filter row, stat tiles, chart cards, table) so nothing jumps.
 */
export function PageSkeleton({
  tiles = 4,
  charts = 2,
  tableRows = 6,
  hero = false,
}: {
  tiles?: number
  charts?: number
  tableRows?: number
  hero?: boolean
}) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-72" />
      </div>
      {tiles > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {hero && (
            <div className="rounded-xl border bg-card p-4 shadow-sm sm:col-span-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-12 w-56" />
              <Skeleton className="mt-3 h-3 w-64" />
            </div>
          )}
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-28" />
              <Skeleton className="mt-3 h-3 w-40" />
            </div>
          ))}
        </div>
      )}
      {charts > 0 && (
        <div className={cn('grid gap-4', charts > 1 && 'lg:grid-cols-2')}>
          {Array.from({ length: charts }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-2 h-3 w-56" />
              <Skeleton className="mt-5 h-52 w-full" />
            </div>
          ))}
        </div>
      )}
      {tableRows > 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="divide-y">
            {Array.from({ length: tableRows }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="ml-auto h-3 w-16" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
