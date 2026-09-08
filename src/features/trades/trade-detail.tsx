import type { Trade } from '@/domain/trade'
import { fmtDateKey, fmtMoney, fmtNumber, fmtPrice, fmtTime, pnlClass } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Fills and fee breakdown of one trade. */
export function TradeDetail({ trade: t }: { trade: Trade }) {
  const fees = Object.entries(t.feeBreakdown).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
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
