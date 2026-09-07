import { PageSkeleton } from '@/components/ui/skeleton'
import { useMemo, useState } from 'react'
import { Pager, usePagination } from '@/components/pager'
import { Card, CardContent } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { computeSummary } from '@/domain/metrics'
import { fmtMoney, fmtNumber, fmtPct } from '@/lib/format'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'
import { sortTrades, TradesTable, type SortKey } from './trades-table'

type Hold = 'all' | 'day' | 'swing'
type Status = 'all' | 'closed' | 'open'

export function TradesPage() {
  const [hold, setHold] = useState<Hold>('all')
  const [status, setStatus] = useState<Status>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  })

  const { trades, basis, loading, range, direction } = useJournal({
    holdType: hold === 'all' ? undefined : hold,
    status: status === 'all' ? undefined : status,
  })

  const visible = useMemo(() => {
    const needle = q.trim().toUpperCase()
    const list = needle ? trades.filter((t) => t.symbol.includes(needle)) : trades
    return sortTrades(list, sort.key, sort.dir)
  }, [trades, q, sort])

  const summary = useMemo(() => computeSummary(visible, basis), [visible, basis])
  const pager = usePagination(
    visible,
    `${direction}|${hold}|${status}|${q}|${sort.key}|${sort.dir}|${range.from}|${range.to}`,
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
