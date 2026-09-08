import { PageSkeleton } from '@/components/ui/skeleton'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pager, usePagination } from '@/components/pager'
import { StatTile } from '@/components/stat-tile'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { attributionDate } from '@/domain/trade'
import { bySymbol, computeSummary, type Bucket, type Summary } from '@/domain/metrics'
import { fmtDateKey, fmtDuration, fmtMoney, fmtNumber, fmtPct, pnlClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'
import { SortHead, symbolPath, type SortDir, type SortState } from '@/features/trades/trades-table'

type Key = 'symbol' | 'trades' | 'winRate' | 'gross' | 'fees' | 'net' | 'avg' | 'hold' | 'last'

interface Row {
  bucket: Bucket
  summary: Summary
  last: string
}

/** Every symbol traded in the range, ranked. Click a row for that symbol's page. */
export function SymbolsPage() {
  const navigate = useNavigate()
  const { trades, basis, loading, range, direction } = useJournal()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortState<Key>>({ key: 'net', dir: 'desc' })

  const rows = useMemo<Row[]>(
    () =>
      bySymbol(trades, basis).map((b) => ({
        bucket: b,
        summary: computeSummary(b.trades, basis),
        last: b.trades.map(attributionDate).sort().at(-1)!,
      })),
    [trades, basis],
  )

  const visible = useMemo(() => {
    const needle = q.trim().toUpperCase()
    const list = needle ? rows.filter((r) => r.bucket.key.includes(needle)) : rows
    return sortRows(list, sort.key, sort.dir)
  }, [rows, q, sort])

  const pager = usePagination(
    visible,
    `${direction}|${q}|${sort.key}|${sort.dir}|${range.from}|${range.to}`,
  )

  const onSort = (key: Key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'symbol' ? 'asc' : 'desc' },
    )

  if (loading) return <PageSkeleton tiles={4} charts={0} tableRows={10} />

  const green = rows.filter((r) => r.bucket.pnl > 0).length
  const best = rows[0]
  const worst = rows.length > 1 ? rows[rows.length - 1] : undefined
  const head = { sort, onSort }

  return (
    <div className="space-y-4">
      <RangeFilter
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Symbol…"
            className="h-8 w-32 rounded-md border bg-background px-2 text-sm"
            aria-label="Filter symbols"
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Symbols traded"
          value={fmtNumber(rows.length)}
          sub={`${fmtNumber(trades.length)} trades in range`}
        />
        <StatTile
          label="Profitable symbols"
          value={rows.length ? fmtPct(green / rows.length, 0) : '—'}
          sub={`${green} green · ${rows.length - green} red or flat`}
        />
        <StatTile
          label="Best symbol"
          value={best ? best.bucket.key : '—'}
          tone="profit"
          sub={
            best
              ? `${fmtMoney(best.bucket.pnl, { sign: true })} · ${best.bucket.count} trades`
              : undefined
          }
        />
        <StatTile
          label="Worst symbol"
          value={worst ? worst.bucket.key : '—'}
          tone="loss"
          sub={
            worst
              ? `${fmtMoney(worst.bucket.pnl, { sign: true })} · ${worst.bucket.count} trades`
              : undefined
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b">
            <Pager p={pager} noun="symbols" />
          </div>
          {pager.items.length ? (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <SortHead k="symbol" {...head}>
                    Symbol
                  </SortHead>
                  <SortHead k="trades" right {...head}>
                    Trades
                  </SortHead>
                  <TH className="text-right">Long / Short</TH>
                  <SortHead k="winRate" right {...head}>
                    Win rate
                  </SortHead>
                  <SortHead k="gross" right {...head}>
                    Gross
                  </SortHead>
                  <SortHead k="fees" right {...head}>
                    Costs
                  </SortHead>
                  <SortHead k="net" right {...head}>
                    Net
                  </SortHead>
                  <SortHead k="avg" right {...head}>
                    Avg / trade
                  </SortHead>
                  <SortHead k="hold" right {...head}>
                    Avg hold
                  </SortHead>
                  <SortHead k="last" right {...head}>
                    Last traded
                  </SortHead>
                </TR>
              </THead>
              <TBody>
                {pager.items.map(({ bucket: b, summary: s, last }) => (
                  <TR
                    key={b.key}
                    className="cursor-pointer"
                    onClick={() => navigate(symbolPath(b.key))}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(symbolPath(b.key))
                    }}
                  >
                    <TD className="font-medium">{b.key}</TD>
                    <TD className="text-right tabular">{fmtNumber(b.count)}</TD>
                    <TD className="text-right tabular text-muted-foreground">
                      {fmtNumber(s.longCount)} / {fmtNumber(s.shortCount)}
                    </TD>
                    <TD className="text-right tabular">{fmtPct(b.winRate, 0)}</TD>
                    <TD
                      className={cn(
                        'text-right tabular',
                        basis === 'gross' ? pnlClass(b.grossPnl) : 'text-muted-foreground',
                      )}
                    >
                      {fmtMoney(b.grossPnl, { sign: true })}
                    </TD>
                    <TD className="text-right tabular text-muted-foreground">{fmtMoney(b.fees)}</TD>
                    <TD
                      className={cn(
                        'text-right tabular font-medium',
                        basis === 'net' ? pnlClass(b.netPnl) : 'text-muted-foreground',
                      )}
                    >
                      {fmtMoney(b.netPnl, { sign: true })}
                    </TD>
                    <TD className={cn('text-right tabular', pnlClass(s.expectancy))}>
                      {fmtMoney(s.expectancy, { sign: true })}
                    </TD>
                    <TD className="text-right tabular text-muted-foreground">
                      {fmtDuration(s.avgHoldMs)}
                    </TD>
                    <TD className="text-right tabular text-muted-foreground">
                      {fmtDateKey(last, 'MMM d, yyyy')}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No symbols</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function sortRows(rows: Row[], key: Key, dir: SortDir): Row[] {
  const m = dir === 'asc' ? 1 : -1
  const val = (r: Row): number | string => {
    switch (key) {
      case 'symbol':
        return r.bucket.key
      case 'trades':
        return r.bucket.count
      case 'winRate':
        return r.bucket.winRate
      case 'gross':
        return r.bucket.grossPnl
      case 'fees':
        return r.bucket.fees
      case 'net':
        return r.bucket.netPnl
      case 'avg':
        return r.summary.expectancy
      case 'hold':
        return r.summary.avgHoldMs
      case 'last':
        return r.last
    }
  }
  return [...rows].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    if (x === y) return a.bucket.key < b.bucket.key ? -1 : 1
    return (x < y ? -1 : 1) * m
  })
}
