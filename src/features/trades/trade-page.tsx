import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Moon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StatTile } from '@/components/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSkeleton } from '@/components/ui/skeleton'
import { computeSummary } from '@/domain/metrics'
import { pnlOf, type Trade } from '@/domain/trade'
import type { TagCount } from '@/domain/trade-note'
import {
  fmtDateKey,
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtTime,
} from '@/lib/format'
import { useJournal } from '@/features/shared/use-journal'
import { useTags } from '@/storage/hooks'
import { saveTradeNote } from '@/storage/repo'
import { TagEditor } from './tag-editor'
import { TradeDetail } from './trade-detail'
import { sortTrades, symbolPath, tradePath, TradesTable } from './trades-table'

/** One trade: numbers, fills, the trader's tags and note, and the symbol's other trades. */
export function TradePage() {
  const { tradeId } = useParams()
  const id = tradeId ? decodeURIComponent(tradeId) : undefined
  const navigate = useNavigate()
  const { allTrades, basis, loading } = useJournal()
  const tags = useTags()

  // allTrades is in entry order, so neighbours are the trades entered just before / after.
  const idx = useMemo(() => allTrades.findIndex((t) => t.id === id), [allTrades, id])
  const trade = idx >= 0 ? allTrades[idx] : undefined
  const older = idx > 0 ? allTrades[idx - 1] : undefined
  const newer = idx >= 0 && idx < allTrades.length - 1 ? allTrades[idx + 1] : undefined

  const others = useMemo(
    () =>
      trade
        ? sortTrades(
            allTrades.filter((t) => t.symbol === trade.symbol && t.id !== trade.id),
            'date',
            'desc',
          )
        : [],
    [allTrades, trade],
  )
  const symbolSummary = useMemo(
    () => computeSummary(trade ? [trade, ...others] : [], basis),
    [trade, others, basis],
  )

  if (loading) return <PageSkeleton tiles={4} charts={2} tableRows={4} />

  if (!trade) {
    return (
      <div className="space-y-4">
        <Link to="/trades" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="size-3.5" /> Trades
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This trade is not in your journal. It may belong to an import that was deleted.
          </CardContent>
        </Card>
      </div>
    )
  }

  const t = trade
  const pnl = pnlOf(t, basis)
  const positionValue = t.avgEntry * t.qty

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/trades" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="size-3.5" /> Trades
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!older}
            onClick={() => older && navigate(tradePath(older))}
            title={older ? `${older.symbol} · ${fmtDateKey(older.entryDate)}` : undefined}
          >
            <ChevronLeft /> Older
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!newer}
            onClick={() => newer && navigate(tradePath(newer))}
            title={newer ? `${newer.symbol} · ${fmtDateKey(newer.entryDate)}` : undefined}
          >
            Newer <ChevronRight />
          </Button>
        </div>
      </div>

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link
              to={symbolPath(t.symbol)}
              className="hover:underline"
              title={`All ${t.symbol} trades`}
            >
              {t.symbol}
            </Link>
          </h1>
          <Badge variant={t.direction === 'long' ? 'default' : 'neutral'}>
            {t.direction === 'long' ? 'Long' : 'Short'}
          </Badge>
          {t.isOvernight ? (
            <Badge variant="outline" className="gap-1">
              <Moon className="size-3" /> {t.daysHeld} day{t.daysHeld === 1 ? '' : 's'}
            </Badge>
          ) : (
            <Badge variant="outline">Day trade</Badge>
          )}
          {t.status === 'open' && <Badge variant="fee">open · {fmtNumber(t.openQty)} sh</Badge>}
        </div>
        <p className="text-sm text-muted-foreground tabular">
          {fmtDateKey(t.entryDate, 'EEEE, MMMM d, yyyy')} · {fmtTime(t.entryTime, 'HH:mm:ss')}
          {t.exitTime !== undefined && (
            <>
              {' → '}
              {t.exitDate !== t.entryDate && `${fmtDateKey(t.exitDate!, 'MMM d')} `}
              {fmtTime(t.exitTime, 'HH:mm:ss')}
            </>
          )}
          {t.account && ` · ${t.account}`}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`${basis === 'net' ? 'Net' : 'Gross'} P&L`}
          value={fmtMoney(pnl, { sign: true })}
          tone={pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : 'neutral'}
          sub={
            basis === 'net'
              ? `${fmtMoney(t.grossPnl, { sign: true })} gross · ${fmtMoney(t.fees)} fees`
              : `${fmtMoney(t.netPnl, { sign: true })} net · ${fmtMoney(t.fees)} fees`
          }
        />
        <StatTile
          label="Return"
          value={t.returnPct !== undefined ? fmtPct(t.returnPct / 100, 2) : '—'}
          tone={pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : 'neutral'}
          sub={`on a ${fmtMoney(positionValue)} position`}
        />
        <StatTile
          label="Size"
          value={`${fmtNumber(t.qty)} sh`}
          sub={`${fmtPrice(t.avgEntry)} → ${t.avgExit !== undefined ? fmtPrice(t.avgExit) : 'open'}`}
        />
        <StatTile
          label="Hold"
          value={fmtDuration(t.holdMs)}
          sub={`${t.fills.length} fills · ${t.fills.filter((f) => f.role === 'entry').length} in, ${t.fills.filter((f) => f.role === 'exit').length} out`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notes &amp; tags</CardTitle>
            <CardDescription>
              Saved in this browser as you type. Tags feed the Analytics page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TradeNotesEditor key={t.id} trade={t} known={tags} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <TradeDetail trade={t} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t.symbol} history</CardTitle>
            <CardDescription>
              {fmtNumber(symbolSummary.tradeCount)} trades all-time · {basis}{' '}
              {fmtMoney(symbolSummary.pnl, { sign: true })} · win rate{' '}
              {fmtPct(symbolSummary.winRate, 0)}
            </CardDescription>
          </div>
          <Link
            to={symbolPath(t.symbol)}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Symbol analytics <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {others.length ? (
            <TradesTable trades={others.slice(0, 10)} basis={basis} compact hideSymbol />
          ) : (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              Your only {t.symbol} trade so far.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type SaveState = 'idle' | 'saving' | 'saved'

/**
 * Tags save immediately; the note is debounced and flushed on blur and unmount.
 * Mounted with `key={trade.id}` so switching trades resets the drafts.
 */
function TradeNotesEditor({ trade, known }: { trade: Trade; known: TagCount[] }) {
  const [tagList, setTagList] = useState<string[]>(trade.tags ?? [])
  const [note, setNote] = useState(trade.note ?? '')
  const [state, setState] = useState<SaveState>('idle')
  const latest = useRef({ tags: tagList, note, dirty: false })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const persist = useCallback(() => {
    clearTimeout(timer.current)
    if (!latest.current.dirty) return
    latest.current.dirty = false
    setState('saving')
    void saveTradeNote(trade.id, { tags: latest.current.tags, note: latest.current.note }).then(
      () => setState('saved'),
    )
  }, [trade.id])

  const onTags = (tags: string[]) => {
    setTagList(tags)
    latest.current = { ...latest.current, tags, dirty: true }
    persist()
  }
  const onNote = (v: string) => {
    setNote(v)
    latest.current = { ...latest.current, note: v, dirty: true }
    setState('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 600)
  }

  // Flush a pending note when the trader navigates away mid-typing.
  useEffect(() => () => persist(), [persist])

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Tags</label>
        <TagEditor value={tagList} onChange={onTags} known={known} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="trade-note" className="text-xs font-medium text-muted-foreground">
            Note
          </label>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {state === 'saving' && 'Saving…'}
            {state === 'saved' && (
              <>
                <Check className="size-3" /> Saved
              </>
            )}
          </span>
        </div>
        <textarea
          id="trade-note"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onBlur={persist}
          rows={7}
          placeholder="What was the setup? Why this entry, this size, this exit? What would you do differently?"
          className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}
