import { ChevronDown, ChevronRight, Moon } from 'lucide-react'
import { Fragment, useState } from 'react'
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

export function sortTrades(trades: Trade[], key: SortKey, dir: 'asc' | 'desc'): Trade[] {
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

export function TradesTable({
  trades,
  basis,
  sort,
  onSort,
  compact,
}: {
  trades: Trade[]
  basis: PnlBasis
  sort?: { key: SortKey; dir: 'asc' | 'desc' }
  onSort?: (key: SortKey) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)

  if (!trades.length)
    return <div className="py-8 text-center text-sm text-muted-foreground">No trades</div>

  const head = { sort, onSort }

  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH className="w-6" />
          <SortHead k="date" {...head}>
            Date
          </SortHead>
          <SortHead k="symbol" {...head}>
            Symbol
          </SortHead>
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
          const expanded = open === t.id
          const pnl = pnlOf(t, basis)
          return (
            <Fragment key={t.id}>
              <TR
                className={cn('cursor-pointer', expanded && 'bg-muted/40')}
                onClick={() => setOpen(expanded ? null : t.id)}
              >
                <TD className="text-muted-foreground">
                  {expanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </TD>
                <TD className="tabular">
                  {fmtDateKey(t.exitDate ?? t.entryDate, 'MMM d')}
                  <span className="ml-1.5 text-muted-foreground text-xs">
                    {fmtTime(t.entryTime, 'HH:mm')}
                  </span>
                </TD>
                <TD className="font-medium">
                  {t.symbol}
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
                </TD>
                <TD>
                  <Badge variant={t.direction === 'long' ? 'default' : 'neutral'}>
                    {t.direction === 'long' ? 'Long' : 'Short'}
                  </Badge>
                </TD>
                <TD className="text-right tabular">{fmtNumber(t.qty)}</TD>
                {!compact && <TD className="text-right tabular">{fmtPrice(t.avgEntry)}</TD>}
                {!compact && (
                  <TD className="text-right tabular">
                    {t.avgExit !== undefined ? fmtPrice(t.avgExit) : '—'}
                  </TD>
                )}
                <TD className="text-right tabular text-muted-foreground">
                  {fmtDuration(t.holdMs)}
                </TD>
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
              {expanded && (
                <TR className="hover:bg-transparent bg-muted/20">
                  <TD colSpan={compact ? 9 : 12} className="whitespace-normal">
                    <TradeDetail trade={t} />
                  </TD>
                </TR>
              )}
            </Fragment>
          )
        })}
      </TBody>
    </Table>
  )
}

function SortHead({
  k,
  children,
  right,
  sort,
  onSort,
}: {
  k: SortKey
  children: React.ReactNode
  right?: boolean
  sort?: { key: SortKey; dir: 'asc' | 'desc' }
  onSort?: (key: SortKey) => void
}) {
  return (
    <TH
      className={cn(
        right && 'text-right',
        onSort && 'cursor-pointer select-none hover:text-foreground',
      )}
      onClick={onSort ? () => onSort(k) : undefined}
      aria-sort={sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {children}
      {sort?.key === k && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
    </TH>
  )
}

function TradeDetail({ trade: t }: { trade: Trade }) {
  const fees = Object.entries(t.feeBreakdown).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return (
    <div className="grid gap-4 py-2 md:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          Executions · {t.fills.length} fills · {fmtDateKey(t.entryDate)}
          {t.exitDate && t.exitDate !== t.entryDate && ` → ${fmtDateKey(t.exitDate)}`}
        </div>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Time</th>
              <th className="py-1 text-left font-medium">Role</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1 text-right font-medium">Price</th>
              <th className="py-1 text-right font-medium">Value</th>
              <th className="py-1 text-right font-medium">Fees</th>
            </tr>
          </thead>
          <tbody>
            {t.fills.map((f, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="py-1 tabular">{fmtTime(f.timestamp)}</td>
                <td className="py-1">
                  <span
                    className={f.role === 'entry' ? 'text-foreground' : 'text-muted-foreground'}
                  >
                    {f.role === 'entry'
                      ? t.direction === 'long'
                        ? 'Buy'
                        : 'Short'
                      : t.direction === 'long'
                        ? 'Sell'
                        : 'Cover'}
                  </span>
                </td>
                <td className="py-1 text-right tabular">{fmtNumber(f.qty)}</td>
                <td className="py-1 text-right tabular">{fmtPrice(f.price)}</td>
                <td className="py-1 text-right tabular">{fmtMoney(f.qty * f.price)}</td>
                <td className="py-1 text-right tabular text-muted-foreground">
                  {fmtMoney(f.fees)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs">
        <div className="mb-1 font-medium text-muted-foreground">Fee breakdown</div>
        {fees.length ? (
          <ul className="space-y-0.5">
            {fees.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="tabular">{fmtMoney(v)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t pt-1 font-medium">
              <span>Total</span>
              <span className="tabular">{fmtMoney(t.fees)}</span>
            </li>
          </ul>
        ) : (
          <div className="text-muted-foreground">No fee details</div>
        )}
        <div className="mt-3 space-y-0.5 text-muted-foreground">
          <div className="flex justify-between">
            <span>Gross P&amp;L</span>
            <span className={cn('tabular', pnlClass(t.grossPnl))}>
              {fmtMoney(t.grossPnl, { sign: true })}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Fees</span>
            <span className="tabular">-{fmtMoney(t.fees)}</span>
          </div>
          <div className="flex justify-between font-medium text-foreground">
            <span>Net P&amp;L</span>
            <span className={cn('tabular', pnlClass(t.netPnl))}>
              {fmtMoney(t.netPnl, { sign: true })}
            </span>
          </div>
          {t.grossPnl > 0 && t.netPnl <= 0 && (
            <div className="pt-1 text-fee">Winner before fees, loser after.</div>
          )}
        </div>
      </div>
    </div>
  )
}
