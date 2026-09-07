import { PageSkeleton } from '@/components/ui/skeleton'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BucketBars } from '@/components/charts/bucket-bars'
import { EquityChart } from '@/components/charts/equity-chart'
import { StatTile } from '@/components/stat-tile'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  byDay,
  computeCosts,
  computeSummary,
  equityCurve,
  maxDrawdown,
  streaks,
} from '@/domain/metrics'
import { fmtDateKey, fmtDuration, fmtMoney, fmtNumber, fmtPct, fmtRatio } from '@/lib/format'
import { Notice } from '@/features/import/import-flow'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'
import { sortTrades, TradesTable } from '@/features/trades/trades-table'
import { MonthGrid } from '@/features/calendar/month-grid'

export function DashboardPage() {
  const { trades, basis, unmatched, loading, cashEntries, hasCashData } = useJournal()
  const summary = useMemo(() => computeSummary(trades, basis), [trades, basis])
  const costs = useMemo(() => computeCosts(trades, cashEntries), [trades, cashEntries])
  const navigate = useNavigate()
  const openDay = (dateKey: string) => navigate(`/calendar/${dateKey.slice(0, 7)}?day=${dateKey}`)
  const curve = useMemo(() => equityCurve(trades), [trades])
  const dd = useMemo(() => maxDrawdown(curve, basis), [curve, basis])
  const st = useMemo(() => streaks(trades, basis), [trades, basis])
  const days = useMemo(() => byDay(trades, basis), [trades, basis])
  const recent = useMemo(() => sortTrades(trades, 'date', 'desc').slice(0, 8), [trades])
  const latestMonth = days.length ? days[days.length - 1]!.key.slice(0, 7) : undefined
  const openTrades = trades.filter((t) => t.status === 'open')

  if (loading) return <PageSkeleton hero tiles={6} charts={2} tableRows={8} />

  const tone = summary.pnl > 0 ? 'profit' : summary.pnl < 0 ? 'loss' : 'neutral'

  return (
    <div className="space-y-6">
      <RangeFilter />

      {unmatched.length > 0 && (
        <Notice
          tone="warn"
          title={`${unmatched.length} fill(s) could not be matched to a position`}
        >
          They close positions that were opened before your earliest import. Import an earlier
          export to include them.{' '}
          <Link to="/settings" className="underline">
            Details in Settings.
          </Link>
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          hero
          className="sm:col-span-2"
          label={`${basis === 'net' ? 'Net' : 'Gross'} P&L`}
          value={fmtMoney(summary.pnl, { sign: true })}
          tone={tone}
          sub={
            <>
              {fmtNumber(summary.closedCount)} closed trades
              {summary.openCount > 0 && ` · ${summary.openCount} open`}
              {' · '}
              {basis === 'net'
                ? `${fmtMoney(summary.grossPnl, { sign: true })} gross`
                : `${fmtMoney(summary.netPnl, { sign: true })} net`}
              {hasCashData && costs.overhead !== 0 && (
                <>
                  {' · '}
                  <Link to="/fees" className="underline">
                    {fmtMoney(costs.bottomLine, { sign: true })} after overhead
                  </Link>
                </>
              )}
            </>
          }
        />
        <Link to="/fees" className="block">
          <StatTile
            className="h-full hover:border-ring transition-colors"
            label={hasCashData ? 'Total cost of trading' : 'Commissions & fees'}
            value={fmtMoney(hasCashData ? costs.totalCosts : summary.fees)}
            tone="fee"
            sub={
              hasCashData
                ? `${fmtMoney(costs.tradingFees)} comm. · ${fmtMoney(costs.locateFees + costs.unusedLocates)} locates · ${fmtMoney(costs.borrowFees)} borrow · ${fmtMoney(costs.software + costs.bankFees + costs.otherFees)} overhead`
                : summary.grossPnl !== 0
                  ? `${fmtPct(summary.feePctOfGross, 0)} of gross P&L · ${fmtMoney(summary.tradeCount ? summary.fees / summary.tradeCount : 0)} per trade`
                  : `${fmtMoney(summary.tradeCount ? summary.fees / summary.tradeCount : 0)} per trade`
            }
          />
        </Link>
        <StatTile
          label="Win rate"
          value={fmtPct(summary.winRate, 1)}
          sub={`${summary.wins} W · ${summary.losses} L${summary.breakeven ? ` · ${summary.breakeven} BE` : ''}`}
        />
        <StatTile
          label="Profit factor"
          value={fmtRatio(summary.profitFactor)}
          sub={`avg win ${fmtMoney(summary.avgWin)} · avg loss ${fmtMoney(summary.avgLoss)}`}
        />
        <StatTile
          label="Expectancy / trade"
          value={fmtMoney(summary.expectancy, { sign: true })}
          tone={summary.expectancy > 0 ? 'profit' : summary.expectancy < 0 ? 'loss' : 'neutral'}
          sub={`largest win ${fmtMoney(summary.largestWin)} · loss ${fmtMoney(summary.largestLoss)}`}
        />
        <StatTile
          label="Avg hold"
          value={fmtDuration(summary.avgHoldMs)}
          sub={`winners ${fmtDuration(summary.avgHoldWinnersMs)} · losers ${fmtDuration(summary.avgHoldLosersMs)}`}
        />
        <StatTile
          label="Max drawdown"
          value={fmtMoney(-dd.maxDrawdown)}
          tone={dd.maxDrawdown > 0 ? 'loss' : 'neutral'}
          sub={`streaks: ${st.maxWins} wins · ${st.maxLosses} losses`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Equity curve</CardTitle>
            <CardDescription>
              Cumulative realized P&L per closed trade. The gap between the lines is fees.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EquityChart points={curve} basis={basis} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>
                {latestMonth ? fmtDateKey(`${latestMonth}-01`, 'MMMM yyyy') : 'Calendar'}
              </CardTitle>
              <CardDescription>Daily {basis} P&L</CardDescription>
            </div>
            <Link
              to={latestMonth ? `/calendar/${latestMonth}` : '/calendar'}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Calendar <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {latestMonth ? (
              <MonthGrid month={latestMonth} days={days} basis={basis} compact onSelect={openDay} />
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No trades in range
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily P&L</CardTitle>
          <CardDescription>
            {basis === 'net' ? 'After' : 'Before'} fees, by exit day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BucketBars
            buckets={days}
            labelFormatter={(k) => fmtDateKey(k, 'MMM d')}
            height={200}
            onSelect={(b) => openDay(b.key)}
          />
        </CardContent>
      </Card>

      {openTrades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open positions</CardTitle>
            <CardDescription>Excluded from statistics until closed</CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-0">
            <TradesTable trades={openTrades} basis={basis} compact />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent trades</CardTitle>
            <CardDescription>Click a row for fills and fee breakdown</CardDescription>
          </div>
          <Link to="/trades" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            All trades <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <TradesTable trades={recent} basis={basis} compact />
        </CardContent>
      </Card>
    </div>
  )
}
