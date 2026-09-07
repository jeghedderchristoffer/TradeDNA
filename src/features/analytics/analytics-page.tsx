import { PageSkeleton } from '@/components/ui/skeleton'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BucketBars } from '@/components/charts/bucket-bars'
import { HBarList } from '@/components/charts/hbar-list'
import { Histogram } from '@/components/charts/histogram'
import { IntradayChart } from '@/components/charts/intraday-chart'
import { StatTile } from '@/components/stat-tile'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import {
  byDirection,
  byHoldType,
  byHour,
  byMonth,
  byDay,
  byWeek,
  byPriceBand,
  byShareBand,
  byValueBand,
  computeConsistency,
  computeRisk,
  firstHourVsRest,
  intradayCurve,
  pnlHistogram,
  stopTradingAt,
  bySymbol,
  byWeekday,
  computeSummary,
  type Bucket,
} from '@/domain/metrics'
import type { PnlBasis } from '@/domain/trade'
import {
  fmtDuration,
  fmtMoney,
  fmtMonthKey,
  fmtNumber,
  fmtPct,
  fmtRatio,
  pnlClass,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'

export function AnalyticsPage() {
  const { trades, basis, loading } = useJournal()
  const summary = useMemo(() => computeSummary(trades, basis), [trades, basis])
  const dirs = useMemo(() => byDirection(trades, basis), [trades, basis])
  const holds = useMemo(() => byHoldType(trades, basis), [trades, basis])
  const weekdays = useMemo(() => byWeekday(trades, basis), [trades, basis])
  const hours = useMemo(() => byHour(trades, basis), [trades, basis])
  const symbols = useMemo(() => bySymbol(trades, basis), [trades, basis])
  const months = useMemo(() => byMonth(trades, basis), [trades, basis])
  const risk = useMemo(() => computeRisk(trades, basis), [trades, basis])
  const histogram = useMemo(() => pnlHistogram(trades, basis), [trades, basis])
  const priceBands = useMemo(() => byPriceBand(trades, basis), [trades, basis])
  const shareBands = useMemo(() => byShareBand(trades, basis), [trades, basis])
  const valueBands = useMemo(() => byValueBand(trades, basis), [trades, basis])
  const intraday = useMemo(() => intradayCurve(trades, basis), [trades, basis])
  const sessions = useMemo(() => firstHourVsRest(trades, basis), [trades, basis])
  const stopRows = useMemo(() => stopTradingAt(trades, basis), [trades, basis])
  const consistency = useMemo(
    () => computeConsistency(byDay(trades, basis), byWeek(trades, basis)),
    [trades, basis],
  )

  if (loading) return <PageSkeleton tiles={4} charts={2} tableRows={4} />

  const top = symbols.slice(0, 8)
  const bottom = symbols
    .slice(-8)
    .reverse()
    .filter((b) => !top.includes(b))

  return (
    <div className="space-y-6">
      <RangeFilter
        right={
          <Link to="/fees" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Fees & costs <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Long vs short · day vs overnight</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By direction</CardTitle>
              <CardDescription>{basis} P&L, win rate and hold time</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <BucketTable buckets={dirs} basis={basis} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By hold type</CardTitle>
              <CardDescription>
                Day trades closed the same day; overnight held across at least one session
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <BucketTable buckets={holds} basis={basis} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Hold time</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Average hold"
            value={fmtDuration(summary.avgHoldMs)}
            sub={`median ${fmtDuration(summary.medianHoldMs)}`}
          />
          <StatTile
            label="Winners held"
            value={fmtDuration(summary.avgHoldWinnersMs)}
            tone="profit"
            sub={`${summary.wins} winning trades`}
          />
          <StatTile
            label="Losers held"
            value={fmtDuration(summary.avgHoldLosersMs)}
            tone="loss"
            sub={`${summary.losses} losing trades`}
          />
          <StatTile
            label="Winners vs losers"
            value={
              summary.avgHoldLosersMs > 0
                ? `${fmtRatio(summary.avgHoldWinnersMs / summary.avgHoldLosersMs, 1)}×`
                : '—'
            }
            sub={
              summary.avgHoldWinnersMs > summary.avgHoldLosersMs
                ? 'You hold winners longer than losers'
                : summary.avgHoldWinnersMs < summary.avgHoldLosersMs
                  ? 'You hold losers longer than winners'
                  : undefined
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">When you trade</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By weekday</CardTitle>
              <CardDescription>{basis} P&L by entry weekday</CardDescription>
            </CardHeader>
            <CardContent>
              <BucketBars buckets={weekdays} height={200} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By hour of day</CardTitle>
              <CardDescription>{basis} P&L by entry hour, Eastern time</CardDescription>
            </CardHeader>
            <CardContent>
              <BucketBars buckets={hours} height={200} />
            </CardContent>
          </Card>
        </div>
        {months.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>By month</CardTitle>
            </CardHeader>
            <CardContent>
              <BucketBars
                buckets={months}
                height={200}
                labelFormatter={(k) => fmtMonthKey(k).slice(0, 3)}
              />
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Risk &amp; sizing</h2>
        <p className="text-xs text-muted-foreground">
          1R is your average losing trade ({fmtMoney(risk.rUnit)}). Everything below is measured
          against it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Average win"
            value={`${fmtRatio(risk.avgWinR, 2)}R`}
            tone="profit"
            sub={`payoff ratio ${fmtRatio(risk.payoffRatio, 2)} · largest win ${fmtRatio(risk.largestWinR, 1)}R`}
          />
          <StatTile
            label="Expectancy"
            value={`${fmtRatio(risk.expectancyR, 2)}R`}
            tone={risk.expectancyR > 0 ? 'profit' : risk.expectancyR < 0 ? 'loss' : 'neutral'}
            sub="per trade, in units of your average loss"
          />
          <StatTile
            label="Largest loss"
            value={`${fmtRatio(risk.largestLossR, 1)}R`}
            tone="loss"
            sub={`${fmtNumber(risk.outsizedLosses)} losses bigger than 2R`}
          />
          <StatTile
            label="If losses were capped at 1R"
            value={fmtMoney(risk.pnlIfLossesCappedAt1R, { sign: true })}
            tone={risk.pnlIfLossesCappedAt1R > summary.pnl ? 'profit' : 'neutral'}
            sub={`vs ${fmtMoney(summary.pnl, { sign: true })} actual · top 5 losers = ${fmtPct(risk.top5LosersShare, 0)} of all losses`}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>P&amp;L distribution</CardTitle>
              <CardDescription>
                Trades per {basis} P&amp;L bin · top 5 winners are{' '}
                {fmtPct(risk.top5WinnersShare, 0)} of all winnings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Histogram bins={histogram} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By position value</CardTitle>
              <CardDescription>
                {basis} P&amp;L by shares × entry price · avg {fmtMoney(risk.avgPositionValue)},
                median {fmtMoney(risk.medianPositionValue)}, max {fmtMoney(risk.maxPositionValue)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BucketBars buckets={valueBands} height={220} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Where the edge is</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By share price</CardTitle>
              <CardDescription>{basis} P&amp;L by average entry price</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <BucketTable buckets={priceBands} basis={basis} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By position size</CardTitle>
              <CardDescription>{basis} P&amp;L by largest share count held</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <BucketTable buckets={shareBands} basis={basis} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Intraday</h2>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Average day</CardTitle>
              <CardDescription>
                Cumulative {basis} P&amp;L through the session, averaged over{' '}
                {fmtNumber(consistency.tradingDays)} trading days, by exit time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IntradayChart points={intraday} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>If you stopped opening trades at…</CardTitle>
              <CardDescription>Keeps only trades entered before the cutoff</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Cutoff</TH>
                    <TH className="text-right">P&amp;L</TH>
                    <TH className="text-right">vs actual</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Removed</TH>
                  </TR>
                </THead>
                <TBody>
                  {stopRows.map((r) => (
                    <TR key={r.cutoff} className="hover:bg-transparent">
                      <TD className="font-medium tabular">{r.cutoff}</TD>
                      <TD className={cn('text-right tabular', pnlClass(r.pnl))}>
                        {fmtMoney(r.pnl, { sign: true })}
                      </TD>
                      <TD className={cn('text-right tabular', pnlClass(r.delta))}>
                        {fmtMoney(r.delta, { sign: true })}
                      </TD>
                      <TD className="text-right tabular">{fmtPct(r.winRate, 0)}</TD>
                      <TD className="text-right tabular text-muted-foreground">
                        {fmtNumber(r.tradesRemoved)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>By session</CardTitle>
            <CardDescription>{basis} P&amp;L by entry time window</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <BucketTable buckets={sessions} basis={basis} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Consistency</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Green days"
            value={fmtPct(consistency.greenDayRate, 0)}
            sub={`${consistency.greenDays} green · ${consistency.redDays} red of ${consistency.tradingDays} days · ${consistency.greenWeeks}/${consistency.weeks} weeks green`}
          />
          <StatTile
            label="Average green vs red day"
            value={`${fmtMoney(consistency.avgGreenDay)} / ${fmtMoney(consistency.avgRedDay)}`}
            sub={`median day ${fmtMoney(consistency.medianDay, { sign: true })} · daily std dev ${fmtMoney(consistency.dailyStdDev)}`}
          />
          <StatTile
            label="Without your best day"
            value={fmtMoney(consistency.pnlWithoutBestDay, { sign: true })}
            tone={
              consistency.pnlWithoutBestDay > 0
                ? 'profit'
                : consistency.pnlWithoutBestDay < 0
                  ? 'loss'
                  : 'neutral'
            }
            sub={`best day ${fmtMoney(consistency.bestDay, { sign: true })} = ${fmtPct(consistency.bestDayShare, 0)} of all daily moves`}
          />
          <StatTile
            label="Without your worst day"
            value={fmtMoney(consistency.pnlWithoutWorstDay, { sign: true })}
            tone={
              consistency.pnlWithoutWorstDay > 0
                ? 'profit'
                : consistency.pnlWithoutWorstDay < 0
                  ? 'loss'
                  : 'neutral'
            }
            sub={`worst day ${fmtMoney(consistency.worstDay, { sign: true })} · streaks ${consistency.maxGreenStreak} green / ${consistency.maxRedStreak} red days`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Symbols</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Best symbols</CardTitle>
              <CardDescription>{basis} P&L · trade count</CardDescription>
            </CardHeader>
            <CardContent>
              <HBarList
                signed
                items={top.map((b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.pnl,
                  meta: `${b.count}`,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Worst symbols</CardTitle>
              <CardDescription>{basis} P&L · trade count</CardDescription>
            </CardHeader>
            <CardContent>
              <HBarList
                signed
                items={bottom.map((b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.pnl,
                  meta: `${b.count}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

function BucketTable({ buckets, basis }: { buckets: Bucket[]; basis: PnlBasis }) {
  if (!buckets.length)
    return <div className="py-8 text-center text-sm text-muted-foreground">No trades</div>
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH />
          <TH className="text-right">Trades</TH>
          <TH className="text-right">Win rate</TH>
          <TH className="text-right">Gross</TH>
          <TH className="text-right">Costs</TH>
          <TH className="text-right">Net</TH>
          <TH className="text-right">Avg / trade</TH>
          <TH className="text-right">Avg hold</TH>
        </TR>
      </THead>
      <TBody>
        {buckets.map((b) => {
          const s = computeSummary(b.trades, basis)
          return (
            <TR key={b.key} className="hover:bg-transparent">
              <TD className="font-medium">{b.label}</TD>
              <TD className="text-right tabular">{fmtNumber(b.count)}</TD>
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
            </TR>
          )
        })}
      </TBody>
    </Table>
  )
}
