import { Moon, StickyNote } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { pnlOf, type PnlBasis, type Trade } from '@/domain/trade'
import {
  fmtDateKey,
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtTime,
  pnlClass,
} from '@/lib/format'
import { cn } from '@/lib/utils'

export type SortKey =
  'date' | 'symbol' | 'direction' | 'qty' | 'hold' | 'gross' | 'fees' | 'net' | 'return'

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

export function sortTrades(trades: Trade[], key: SortKey, dir: SortDir): Trade[] {
  const m = dir === 'asc' ? 1 : -1
  const val = (t: Trade): number | string => {
    switch (key) {
      case 'date':
        return t.exitTime ?? t.entryTime
      case 'symbol':
        return t.symbol
      case 'direction':
        return t.direction
      case 'qty':
        return t.qty
      case 'hold':
        return t.holdMs ?? Number.MAX_SAFE_INTEGER
      case 'gross':
        return t.grossPnl
      case 'fees':
        return t.fees
      case 'net':
        return t.netPnl
      case 'return':
        return t.returnPct ?? 0
    }
  }
  return [...trades].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    if (x === y) return (a.entryTime - b.entryTime) * m
    return (x < y ? -1 : 1) * m
  })
}

export const tradePath = (t: Pick<Trade, 'id'>) => `/trades/${encodeURIComponent(t.id)}`
export const symbolPath = (symbol: string) => `/symbols/${encodeURIComponent(symbol)}`

/** Clicking a row opens the trade's page; clicking the symbol opens the symbol's page. */
export function TradesTable({
  trades,
  basis,
  sort,
  onSort,
  compact,
  hideSymbol,
}: {
  trades: Trade[]
  basis: PnlBasis
  sort?: SortState<SortKey>
  onSort?: (key: SortKey) => void
  compact?: boolean
  /** On a symbol's own page the column is redundant. */
  hideSymbol?: boolean
}) {
  const navigate = useNavigate()

  if (!trades.length)
    return <div className="py-8 text-center text-sm text-muted-foreground">No trades</div>

  const head = { sort, onSort }

  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <SortHead k="date" {...head}>
            Date
          </SortHead>
          {!hideSymbol && (
            <SortHead k="symbol" {...head}>
              Symbol
            </SortHead>
          )}
          <SortHead k="direction" {...head}>
            Side
          </SortHead>
          <SortHead k="qty" right {...head}>
            Qty
          </SortHead>
          {!compact && <TH className="text-right">Entry</TH>}
          {!compact && <TH className="text-right">Exit</TH>}
          <SortHead k="hold" right {...head}>
            Hold
          </SortHead>
          <SortHead k="gross" right {...head}>
            Gross
          </SortHead>
          <SortHead k="fees" right {...head}>
            Fees
          </SortHead>
          <SortHead k="net" right {...head}>
            Net
          </SortHead>
          {!compact && (
            <SortHead k="return" right {...head}>
              Return
            </SortHead>
          )}
        </TR>
      </THead>
      <TBody>
        {trades.map((t) => {
          const pnl = pnlOf(t, basis)
          return (
            <TR
              key={t.id}
              className="cursor-pointer"
              onClick={() => navigate(tradePath(t))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(tradePath(t))
              }}
              tabIndex={0}
              aria-label={`Open ${t.symbol} trade`}
            >
              <TD className="tabular">
                {fmtDateKey(t.exitDate ?? t.entryDate, 'MMM d')}
                <span className="ml-1.5 text-muted-foreground text-xs">
                  {fmtTime(t.entryTime, 'HH:mm')}
                </span>
              </TD>
              {!hideSymbol && (
                <TD className="font-medium">
                  <Link
                    to={symbolPath(t.symbol)}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                    title={`All ${t.symbol} trades`}
                  >
                    {t.symbol}
                  </Link>
                  <TradeMarkers trade={t} />
                </TD>
              )}
              <TD>
                <Badge variant={t.direction === 'long' ? 'default' : 'neutral'}>
                  {t.direction === 'long' ? 'Long' : 'Short'}
                </Badge>
                {hideSymbol && <TradeMarkers trade={t} />}
              </TD>
              <TD className="text-right tabular">{fmtNumber(t.qty)}</TD>
              {!compact && <TD className="text-right tabular">{fmtPrice(t.avgEntry)}</TD>}
              {!compact && (
                <TD className="text-right tabular">
                  {t.avgExit !== undefined ? fmtPrice(t.avgExit) : '—'}
                </TD>
              )}
              <TD className="text-right tabular text-muted-foreground">{fmtDuration(t.holdMs)}</TD>
              <TD
                className={cn(
                  'text-right tabular',
                  basis === 'gross' ? pnlClass(t.grossPnl) : 'text-muted-foreground',
                )}
              >
                {fmtMoney(t.grossPnl, { sign: true })}
              </TD>
              <TD className="text-right tabular text-muted-foreground">{fmtMoney(t.fees)}</TD>
              <TD
                className={cn(
                  'text-right tabular font-medium',
                  basis === 'net' ? pnlClass(t.netPnl) : 'text-muted-foreground',
                )}
              >
                {fmtMoney(t.netPnl, { sign: true })}
              </TD>
              {!compact && (
                <TD className={cn('text-right tabular', pnlClass(pnl))}>
                  {t.returnPct !== undefined ? fmtPct(t.returnPct / 100, 2) : '—'}
                </TD>
              )}
            </TR>
          )
        })}
      </TBody>
    </Table>
  )
}

/** Overnight moon, open badge, note icon and up to three tags, inline after the symbol. */
function TradeMarkers({ trade: t }: { trade: Trade }) {
  const tags = t.tags ?? []
  return (
    <>
      {t.isOvernight && (
        <span
          title={`Held ${t.daysHeld} day(s)`}
          className="ml-1.5 inline-flex align-middle text-muted-foreground"
        >
          <Moon className="size-3" />
        </span>
      )}
      {t.status === 'open' && (
        <Badge variant="outline" className="ml-1.5">
          open · {fmtNumber(t.openQty)}
        </Badge>
      )}
      {t.note && (
        <span title={t.note} className="ml-1.5 inline-flex align-middle text-muted-foreground">
          <StickyNote className="size-3" />
        </span>
      )}
      {tags.slice(0, 3).map((tag) => (
        <Badge key={tag} variant="neutral" className="ml-1 px-1.5 py-0 font-normal">
          {tag}
        </Badge>
      ))}
      {tags.length > 3 && (
        <span className="ml-1 text-xs text-muted-foreground" title={tags.slice(3).join(', ')}>
          +{tags.length - 3}
        </span>
      )}
    </>
  )
}

export function SortHead<K extends string>({
  k,
  children,
  right,
  sort,
  onSort,
  className,
}: {
  k: K
  children: React.ReactNode
  right?: boolean
  sort?: SortState<K>
  onSort?: (key: K) => void
  className?: string
}) {
  return (
    <TH
      className={cn(
        right && 'text-right',
        onSort && 'cursor-pointer select-none hover:text-foreground',
        className,
      )}
      onClick={onSort ? () => onSort(k) : undefined}
      aria-sort={sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {children}
      {sort?.key === k && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
    </TH>
  )
}
