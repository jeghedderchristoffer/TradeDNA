import { PageSkeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BucketBars } from '@/components/charts/bucket-bars'
import { EquityChart } from '@/components/charts/equity-chart'
import { StatTile } from '@/components/stat-tile'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  byDirection,
  byHoldType,
  byHour,
  byTag,
  computeSummary,
  equityCurve,
  maxDrawdown,
} from '@/domain/metrics'
import { attributionDate } from '@/domain/trade'
import { fmtDateKey, fmtDuration, fmtMoney, fmtNumber, fmtPct, fmtRatio } from '@/lib/format'
import { BucketTable } from '@/features/analytics/bucket-table'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'
import {
  sortTrades,
  TradesTable,
  type SortKey,
  type SortState,
} from '@/features/trades/trades-table'

/** Everything about one symbol: P&L, win rate, equity curve, when and how it was traded. */
export function SymbolPage() {
  const { symbol: param } = useParams()
  const symbol = param ? decodeURIComponent(param).toUpperCase() : ''
  const navigate = useNavigate()
  const { allTrades, trades, basis, loading } = useJournal({ symbols: [symbol] })
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'date', dir: 'desc' })

  const everTraded = useMemo(
    () => allTrades.filter((t) => t.symbol === symbol),
    [allTrades, symbol],
  )
  const summary = useMemo(() => computeSummary(trades, basis), [trades, basis])
  const curve = useMemo(() => equityCurve(trades), [trades])
  const dd = useMemo(() => maxDrawdown(curve, basis), [curve, basis])
  const dirs = useMemo(() => byDirection(trades, basis), [trades, basis])
  const holds = useMemo(() => byHoldType(trades, basis), [trades, basis])
  const hours = useMemo(() => byHour(trades, basis), [trades, basis])
  const tags = useMemo(() => byTag(trades, basis), [trades, basis])
  const sorted = useMemo(() => sortTrades(trades, sort.key, sort.dir), [trades, sort])

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'symbol' || key === 'direction' ? 'asc' : 'desc' },
    )

  if (loading) return <PageSkeleton tiles={4} charts={2} tableRows={6} />

  const back = (
    <Link to="/symbols" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      <ArrowLeft className="size-3.5" /> Symbols
    </Link>
  )

  if (!everTraded.length) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No trades in {symbol || 'this symbol'}.
          </CardContent>
        </Card>
      </div>
    )
  }

  const dates = everTraded.map(attributionDate).sort()
  const first = dates[0]!
  const last = dates[dates.length - 1]!
  const tone = summary.pnl > 0 ? 'profit' : summary.pnl < 0 ? 'loss' : 'neutral'
  const longs = dirs.find((d) => d.key === 'long')
  const shorts = dirs.find((d) => d.key === 'short')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">{symbol}</h1>
        <span className="text-sm text-muted-foreground">
          {fmtNumber(everTraded.length)} trades all-time · {fmtDateKey(first, 'MMM d, yyyy')}
          {first !== last && ` – ${fmtDateKey(last, 'MMM d, yyyy')}`}
        </span>
      </div>

      <RangeFilter />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`${basis === 'net' ? 'Net' : 'Gross'} P&L`}
          value={fmtMoney(summary.pnl, { sign: true })}
          tone={tone}
          sub={`${fmtNumber(summary.closedCount)} closed${summary.openCount ? ` · ${summary.openCount} open` : ''} · ${basis === 'net' ? `${fmtMoney(summary.grossPnl, { sign: true })} gross` : `${fmtMoney(summary.netPnl, { sign: true })} net`}`}
        />
        <StatTile
          label="Win rate"
          value={fmtPct(summary.winRate, 0)}
          sub={`${summary.wins} W · ${summary.losses} L${summary.breakeven ? ` · ${summary.breakeven} BE` : ''} · profit factor ${fmtRatio(summary.profitFactor)}`}
        />
        <StatTile
          label="Expectancy / trade"
          value={fmtMoney(summary.expectancy, { sign: true })}
          tone={summary.expectancy > 0 ? 'profit' : summary.expectancy < 0 ? 'loss' : 'neutral'}
          sub={`avg win ${fmtMoney(summary.avgWin)} · avg loss ${fmtMoney(summary.avgLoss)}`}
        />
        <StatTile label="Costs" value={fmtMoney(summary.fees)} tone="fee" sub={costsLine(trades)} />
        <StatTile
          label="Long vs short"
          value={`${fmtNumber(longs?.count ?? 0)} / ${fmtNumber(shorts?.count ?? 0)}`}
          sub={`long ${fmtMoney(longs?.pnl ?? 0, { sign: true })} · short ${fmtMoney(shorts?.pnl ?? 0, { sign: true })}`}
        />
        <StatTile
          label="Avg hold"
          value={fmtDuration(summary.avgHoldMs)}
          sub={`winners ${fmtDuration(summary.avgHoldWinnersMs)} · losers ${fmtDuration(summary.avgHoldLosersMs)}`}
        />
        <StatTile
          label="Largest win / loss"
          value={`${fmtMoney(summary.largestWin)} / ${fmtMoney(summary.largestLoss)}`}
          sub={`max drawdown ${fmtMoney(-dd.maxDrawdown)}`}
        />
        <StatTile
          label="Dollar volume"
          value={fmtMoney(summary.volume, { compact: true })}
          sub={`${fmtNumber(trades.reduce((a, t) => a + t.fills.reduce((b, f) => b + f.qty, 0), 0))} shares traded`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Equity curve</CardTitle>
            <CardDescription>Cumulative realized P&L in {symbol}, per closed trade</CardDescription>
          </CardHeader>
          <CardContent>
            <EquityChart points={curve} basis={basis} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>By hour of day</CardTitle>
            <CardDescription>{basis} P&L by entry hour, Eastern time</CardDescription>
          </CardHeader>
          <CardContent>
            <BucketBars buckets={hours} height={220} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By direction &amp; hold</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <BucketTable buckets={[...dirs, ...holds]} basis={basis} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By tag</CardTitle>
            <CardDescription>
              {tags.length
                ? 'A trade with several tags counts in each'
                : 'Open a trade below to tag it'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <BucketTable
              buckets={tags}
              basis={basis}
              empty={`No tagged ${symbol} trades yet`}
              onSelect={(b) => navigate(`/trades?tag=${encodeURIComponent(b.key)}`)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trades</CardTitle>
          <CardDescription>
            {fmtNumber(trades.length)} in range · click a row to open it
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <TradesTable trades={sorted} basis={basis} sort={sort} onSort={onSort} hideSymbol />
        </CardContent>
      </Card>
    </div>
  )
}

function costsLine(trades: { tradingFees: number; locateFees: number; borrowFees: number }[]) {
  const comm = trades.reduce((a, t) => a + t.tradingFees, 0)
  const loc = trades.reduce((a, t) => a + t.locateFees, 0)
  const bor = trades.reduce((a, t) => a + t.borrowFees, 0)
  const parts = [`${fmtMoney(comm)} commissions`]
  if (loc) parts.push(`${fmtMoney(loc)} locates`)
  if (bor) parts.push(`${fmtMoney(bor)} borrow`)
  return parts.join(' · ')
}
