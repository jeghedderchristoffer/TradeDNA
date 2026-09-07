import { PageSkeleton } from '@/components/ui/skeleton'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useChartTheme } from '@/components/charts/chart-theme'
import { CostBars } from '@/components/charts/cost-bars'
import { HBarList } from '@/components/charts/hbar-list'
import { Pager, usePagination } from '@/components/pager'
import { StatTile } from '@/components/stat-tile'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { costOf } from '@/domain/cash-entry'
import { computeCosts, computeFeeStats, costsByMonth, costsBySymbol } from '@/domain/metrics'
import { fmtDateKey, fmtMoney, fmtNumber, fmtPct, pnlClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Notice } from '@/features/import/import-flow'
import { RangeFilter } from '@/features/shared/range-filter'
import { useJournal } from '@/features/shared/use-journal'

export function FeesPage() {
  const { trades, cashEntries, unallocated, hasCashData, loading, range } = useJournal()
  const th = useChartTheme()
  const costs = useMemo(() => computeCosts(trades, cashEntries), [trades, cashEntries])
  const months = useMemo(() => costsByMonth(trades, cashEntries), [trades, cashEntries])
  const symbols = useMemo(() => costsBySymbol(trades, unallocated), [trades, unallocated])
  const fees = useMemo(() => computeFeeStats(trades), [trades])
  const sortedEntries = useMemo(
    () =>
      [...cashEntries].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : a.sequence - b.sequence,
      ),
    [cashEntries],
  )
  const entriesPager = usePagination(sortedEntries, `${range.from}|${range.to}`, 25)

  if (loading) return <PageSkeleton hero tiles={4} charts={1} tableRows={6} />

  const locatesPaid = costs.locateFees + costs.unusedLocates
  const unusedBySymbol = Object.entries(
    unallocated.reduce<Record<string, number>>((acc, e) => {
      if (e.symbol) acc[e.symbol] = (acc[e.symbol] ?? 0) + costOf(e)
      return acc
    }, {}),
  )
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const shareRows = [
    { label: 'Commissions & regulatory fees', value: costs.tradingFees },
    { label: 'Locates used on trades', value: costs.locateFees },
    { label: 'Overnight borrow', value: costs.borrowFees },
    { label: 'Locates never used', value: costs.unusedLocates },
    { label: 'Software & data', value: costs.software },
    { label: 'Bank fees', value: costs.bankFees },
    { label: 'Other', value: costs.otherFees + costs.unmatchedBorrow },
  ].filter((r) => Math.abs(r.value) > 0.005)

  return (
    <div className="space-y-6">
      <RangeFilter />

      {!hasCashData && (
        <Notice tone="info" title="Only commissions so far">
          Import your broker's Cash Journal to add locate fees, overnight borrow charges, software
          and banking costs.{' '}
          <Link to="/import" className="underline">
            Import it now.
          </Link>
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          hero
          label="Total cost of trading"
          value={fmtMoney(costs.totalCosts)}
          tone="fee"
          sub={
            costs.grossPnl !== 0
              ? `${fmtPct(costs.costPctOfGross, 0)} of ${fmtMoney(Math.abs(costs.grossPnl))} gross P&L`
              : 'no closed trades in range'
          }
        />
        <StatTile
          hero
          label="Bottom line"
          value={fmtMoney(costs.bottomLine, { sign: true })}
          tone={costs.bottomLine > 0 ? 'profit' : costs.bottomLine < 0 ? 'loss' : 'neutral'}
          sub={`gross ${fmtMoney(costs.grossPnl, { sign: true })} → net ${fmtMoney(costs.netPnl, { sign: true })} → after overhead`}
        />
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Commissions & fees"
            value={fmtMoney(costs.tradingFees)}
            sub={`${fmtMoney(fees.perTrade)} per trade`}
          />
          <StatTile
            label="Locates"
            value={fmtMoney(locatesPaid)}
            sub={hasCashData ? `${fmtMoney(costs.unusedLocates)} never used` : '—'}
          />
          <StatTile
            label="Overnight borrow"
            value={fmtMoney(costs.borrowFees + costs.unmatchedBorrow)}
          />
          <StatTile
            label="Overhead"
            value={fmtMoney(costs.software + costs.bankFees + costs.otherFees)}
            sub="software, bank fees"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Costs per month</CardTitle>
          <CardDescription>
            Trade costs land on the exit month, account costs on their own date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CostBars months={months} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
            <CardDescription>Share of total costs</CardDescription>
          </CardHeader>
          <CardContent>
            <HBarList
              color={th.fee}
              items={shareRows.map((r) => ({
                key: r.label,
                label: r.label,
                value: r.value,
                meta: costs.totalCosts ? fmtPct(r.value / costs.totalCosts, 0) : '',
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Per-fill fee types</CardTitle>
            <CardDescription>
              From the trade history, plus attributed locates and borrow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HBarList
              color={th.fee}
              items={fees.byType.map((f) => ({
                key: f.type,
                label: f.type,
                value: f.amount,
                meta: fmtPct(f.share, 0),
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fees vs results</CardTitle>
            <CardDescription>What the costs did to your trades</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Win rate before → after costs"
              value={`${fmtPct(fees.grossWinRate, 0)} → ${fmtPct(fees.netWinRate, 0)}`}
            />
            <Row
              label="Winners turned into losers by costs"
              value={fmtNumber(fees.grossWinnersNetLosers)}
            />
            <Row label="Average cost per trade" value={fmtMoney(fees.perTrade)} />
            <Row label="Cost per share traded" value={fmtMoney(fees.perShare)} />
            <Row label="Costs as % of dollar volume" value={fmtPct(fees.pctOfVolume, 3)} />
            {hasCashData && (
              <Row
                label="Deposits · withdrawals in range"
                value={`${fmtMoney(costs.deposits)} · ${fmtMoney(costs.withdrawals)}`}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {hasCashData && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Locate efficiency</CardTitle>
              <CardDescription>Locates you paid for but never shorted</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Locates paid (net of credits)" value={fmtMoney(locatesPaid)} />
              <Row label="Used on trades" value={fmtMoney(costs.locateFees)} />
              <Row label="Never used" value={fmtMoney(costs.unusedLocates)} />
              <Row
                label="Wasted share"
                value={locatesPaid > 0 ? fmtPct(costs.unusedLocates / locatesPaid, 0) : '—'}
              />
              {unusedBySymbol.length > 0 && (
                <div className="pt-2">
                  <div className="mb-1 text-xs text-muted-foreground">Unused locates by symbol</div>
                  <HBarList
                    color={th.series[3]!}
                    items={unusedBySymbol.map(([s, v]) => ({ key: s, label: s, value: v }))}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Most expensive symbols</CardTitle>
              <CardDescription>
                All costs per symbol, including locates that were never used
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Symbol</TH>
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Gross</TH>
                    <TH className="text-right">Comm.</TH>
                    <TH className="text-right">Locates</TH>
                    <TH className="text-right">Borrow</TH>
                    <TH className="text-right">Unused</TH>
                    <TH className="text-right">Total costs</TH>
                    <TH className="text-right">After all</TH>
                  </TR>
                </THead>
                <TBody>
                  {symbols.slice(0, 12).map((s) => (
                    <TR key={s.symbol} className="hover:bg-transparent">
                      <TD className="font-medium">{s.symbol}</TD>
                      <TD className="text-right tabular">{s.trades}</TD>
                      <TD className={cn('text-right tabular', pnlClass(s.grossPnl))}>
                        {fmtMoney(s.grossPnl, { sign: true })}
                      </TD>
                      <TD className="text-right tabular text-muted-foreground">
                        {fmtMoney(s.tradingFees)}
                      </TD>
                      <TD className="text-right tabular text-muted-foreground">
                        {fmtMoney(s.locateFees)}
                      </TD>
                      <TD className="text-right tabular text-muted-foreground">
                        {fmtMoney(s.borrowFees)}
                      </TD>
                      <TD className="text-right tabular text-muted-foreground">
                        {fmtMoney(s.unusedLocates)}
                      </TD>
                      <TD className="text-right tabular font-medium">{fmtMoney(s.totalCosts)}</TD>
                      <TD className={cn('text-right tabular font-medium', pnlClass(s.netAfterAll))}>
                        {fmtMoney(s.netAfterAll, { sign: true })}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {hasCashData && cashEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Account-level entries</CardTitle>
            <CardDescription>
              Cash journal rows not attached to any trade, newest first
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Note</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {entriesPager.items.map((e) => (
                  <TR key={e.id} className="hover:bg-transparent">
                    <TD className="tabular">{fmtDateKey(e.date)}</TD>
                    <TD>{e.type}</TD>
                    <TD className="max-w-md truncate text-muted-foreground" title={e.note}>
                      {e.note}
                    </TD>
                    <TD className={cn('text-right tabular', e.amount > 0 ? 'text-profit' : '')}>
                      {fmtMoney(e.amount, { sign: true })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t">
              <Pager p={entriesPager} noun="entries" />
            </div>
          </CardContent>
        </Card>
      )}

      {!hasCashData && (
        <div>
          <Link to="/import" className={buttonVariants({ variant: 'outline' })}>
            Import Cash Journal
          </Link>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
  )
}
