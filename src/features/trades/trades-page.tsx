import { PageSkeleton } from '@/components/ui/skeleton'
import { Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pager, usePagination } from '@/components/pager'
import { Card, CardContent } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { computeSummary } from '@/domain/metrics'
import { fmtMoney, fmtNumber, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'
import { useTags } from '@/storage/hooks'
import { sortTrades, TradesTable, type SortKey, type SortState } from './trades-table'

type Hold = 'all' | 'day' | 'swing'
type Status = 'all' | 'closed' | 'open'
const UNTAGGED = '__untagged'

export function TradesPage() {
  const [hold, setHold] = useState<Hold>('all')
  const [status, setStatus] = useState<Status>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'date', dir: 'desc' })
  // Selected tags live in the URL (?tag=a&tag=b) so Analytics can deep-link to them.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTags = searchParams.getAll('tag')
  const untagged = selectedTags.includes(UNTAGGED)
  const tagFilter = selectedTags.filter((t) => t !== UNTAGGED)
  const allTags = useTags()

  const toggleTag = (tag: string) => {
    const next =
      tag === UNTAGGED
        ? untagged
          ? []
          : [UNTAGGED]
        : selectedTags.includes(tag)
          ? selectedTags.filter((t) => t !== tag)
          : [...tagFilter, tag]
    setSearchParams(next.length ? { tag: next } : {})
  }

  const { trades, basis, loading, range, direction } = useJournal({
    holdType: hold === 'all' ? undefined : hold,
    status: status === 'all' ? undefined : status,
    tags: tagFilter.length ? tagFilter : undefined,
    untagged: untagged || undefined,
  })

  const visible = useMemo(() => {
    const needle = q.trim().toUpperCase()
    const list = needle ? trades.filter((t) => t.symbol.includes(needle)) : trades
    return sortTrades(list, sort.key, sort.dir)
  }, [trades, q, sort])

  const summary = useMemo(() => computeSummary(visible, basis), [visible, basis])
  const pager = usePagination(
    visible,
    `${direction}|${hold}|${status}|${q}|${sort.key}|${sort.dir}|${range.from}|${range.to}|${selectedTags.join(',')}`,
  )

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'symbol' || key === 'direction' ? 'asc' : 'desc' },
    )

  if (loading) return <PageSkeleton tiles={0} charts={0} tableRows={12} />

  return (
    <div className="space-y-4">
      <RangeFilter
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Symbol…"
            className="h-8 w-32 rounded-md border bg-background px-2 text-sm"
            aria-label="Filter by symbol"
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={hold}
          onChange={setHold}
          options={[
            { value: 'all', label: 'Any hold' },
            { value: 'day', label: 'Day trades' },
            { value: 'swing', label: 'Overnight' },
          ]}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'closed', label: 'Closed' },
            { value: 'open', label: 'Open' },
          ]}
        />
        <div className="ml-auto text-xs text-muted-foreground tabular">
          {fmtNumber(visible.length)} trades · {basis} {fmtMoney(summary.pnl, { sign: true })} ·
          costs {fmtMoney(summary.fees)} · win {fmtPct(summary.winRate, 0)}
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by tag">
          <Tag className="size-3.5 text-muted-foreground" />
          {allTags.map(({ tag, count }) => (
            <TagChip
              key={tag}
              active={tagFilter.includes(tag)}
              onClick={() => toggleTag(tag)}
              label={tag}
              count={count}
            />
          ))}
          <TagChip active={untagged} onClick={() => toggleTag(UNTAGGED)} label="untagged" dashed />
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="border-b">
            <Pager p={pager} noun="trades" />
          </div>
          <TradesTable trades={pager.items} basis={basis} sort={sort} onSort={onSort} />
          {pager.pageCount > 1 && (
            <div className="border-t">
              <Pager p={pager} noun="trades" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TagChip({
  label,
  count,
  active,
  dashed,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  dashed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors',
        dashed && 'border-dashed',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
      )}
    >
      {label}
      {count !== undefined && <span className="opacity-70 tabular">{count}</span>}
    </button>
  )
}
