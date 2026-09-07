import { PageSkeleton } from '@/components/ui/skeleton'
import { addMonths, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { StatTile } from '@/components/stat-tile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { byDay, computeSummary, filterTrades } from '@/domain/metrics'
import { fmtDateKey, fmtMoney, fmtMonthKey, fmtNumber, fmtPct } from '@/lib/format'
import { useJournal } from '@/features/shared/use-journal'
import { TradesTable } from '@/features/trades/trades-table'
import { MonthGrid } from './month-grid'

export function CalendarPage() {
  const { month: monthParam } = useParams()
  const navigate = useNavigate()
  const { allTrades, basis, loading } = useJournal()
  // The selected day lives in the URL (?day=YYYY-MM-DD) so other pages can deep-link to it.
  const [searchParams, setSearchParams] = useSearchParams()
  const dayParam = searchParams.get('day')
  const selected = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined
  const setSelected = (k: string | undefined) => setSearchParams(k ? { day: k } : {})
  const dayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected) dayRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [selected])

  const days = useMemo(() => byDay(allTrades, basis), [allTrades, basis])
  const months = useMemo(() => [...new Set(days.map((d) => d.key.slice(0, 7)))].sort(), [days])
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : (months[months.length - 1] ?? format(new Date(), 'yyyy-MM'))

  const monthTrades = useMemo(
    () => filterTrades(allTrades, { from: `${month}-01`, to: `${month}-31` }),
    [allTrades, month],
  )
  const summary = useMemo(() => computeSummary(monthTrades, basis), [monthTrades, basis])
  const monthDays = days.filter((d) => d.key.startsWith(month))
  const best = monthDays.reduce<(typeof monthDays)[number] | undefined>(
    (a, d) => (!a || d.pnl > a.pnl ? d : a),
    undefined,
  )
  const worst = monthDays.reduce<(typeof monthDays)[number] | undefined>(
    (a, d) => (!a || d.pnl < a.pnl ? d : a),
    undefined,
  )
  const greenDays = monthDays.filter((d) => d.pnl > 0).length

  const go = (delta: number) =>
    navigate(`/calendar/${format(addMonths(parseISO(`${month}-01`), delta), 'yyyy-MM')}`)

  const dayTrades = selected
    ? monthTrades.filter((t) => (t.exitDate ?? t.entryDate) === selected)
    : []
  const daySummary = selected ? computeSummary(dayTrades, basis) : undefined

  if (loading) return <PageSkeleton tiles={5} charts={1} tableRows={0} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <h1 className="min-w-44 text-center text-xl font-semibold tracking-tight">
          {fmtMonthKey(month)}
        </h1>
        <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Next month">
          <ChevronRight />
        </Button>
        {months.length > 1 && (
          <select
            className="ml-2 h-9 rounded-md border bg-background px-2 text-sm"
            value={months.includes(month) ? month : ''}
            onChange={(e) => navigate(`/calendar/${e.target.value}`)}
          >
            {!months.includes(month) && <option value="">Jump to…</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {fmtMonthKey(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label={`${basis === 'net' ? 'Net' : 'Gross'} P&L`}
          value={fmtMoney(summary.pnl, { sign: true })}
          tone={summary.pnl > 0 ? 'profit' : summary.pnl < 0 ? 'loss' : 'neutral'}
          sub={`${fmtNumber(summary.closedCount)} trades · ${monthDays.length} trading days`}
        />
        <StatTile
          label="Fees"
          value={fmtMoney(summary.fees)}
          tone="fee"
          sub={summary.grossPnl !== 0 ? `${fmtPct(summary.feePctOfGross, 0)} of gross` : undefined}
        />
        <StatTile
          label="Win rate"
          value={fmtPct(summary.winRate)}
          sub={`${greenDays} of ${monthDays.length} days green`}
        />
        <StatTile
          label="Best day"
          value={best ? fmtMoney(best.pnl, { sign: true }) : '—'}
          tone="profit"
          sub={best ? fmtDateKey(best.key) : undefined}
        />
        <StatTile
          label="Worst day"
          value={worst ? fmtMoney(worst.pnl, { sign: true }) : '—'}
          tone="loss"
          sub={worst ? fmtDateKey(worst.key) : undefined}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <MonthGrid
            month={month}
            days={days}
            basis={basis}
            selected={selected}
            onSelect={(k) => setSelected(k === selected ? undefined : k)}
          />
        </CardContent>
      </Card>

      {selected && daySummary && (
        <Card ref={dayRef} className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{fmtDateKey(selected, 'EEEE, MMMM d, yyyy')}</CardTitle>
            <CardDescription>
              {fmtNumber(daySummary.closedCount)} trades · gross{' '}
              {fmtMoney(daySummary.grossPnl, { sign: true })} · fees {fmtMoney(daySummary.fees)} ·
              net {fmtMoney(daySummary.netPnl, { sign: true })} · win rate{' '}
              {fmtPct(daySummary.winRate, 0)}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <TradesTable trades={dayTrades} basis={basis} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
