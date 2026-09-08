import type { ReactNode } from 'react'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { computeSummary, type Bucket } from '@/domain/metrics'
import type { PnlBasis } from '@/domain/trade'
import { fmtDuration, fmtMoney, fmtNumber, fmtPct, pnlClass } from '@/lib/format'
import { cn } from '@/lib/utils'

/** One row per bucket: count, win rate, gross, costs, net, expectancy, hold. */
export function BucketTable({
  buckets,
  basis,
  renderLabel = (b) => b.label,
  onSelect,
  empty = 'No trades',
}: {
  buckets: Bucket[]
  basis: PnlBasis
  /** Custom label cell, e.g. a link. */
  renderLabel?: (b: Bucket) => ReactNode
  onSelect?: (b: Bucket) => void
  empty?: string
}) {
  if (!buckets.length)
    return <div className="py-8 text-center text-sm text-muted-foreground">{empty}</div>
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
            <TR
              key={b.key}
              className={onSelect ? 'cursor-pointer' : 'hover:bg-transparent'}
              onClick={onSelect ? () => onSelect(b) : undefined}
            >
              <TD className="font-medium">{renderLabel(b)}</TD>
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
