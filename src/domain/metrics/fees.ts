import type { Trade } from '../trade'
import { closedOnly } from './filter'
import { sum } from './summary'

export interface FeeTypeStat {
  type: string
  amount: number
  /** Share of total fees, 0..1 */
  share: number
}

export interface FeeStats {
  total: number
  byType: FeeTypeStat[]
  /** fees / |gross P&L| */
  pctOfGross: number
  /** fees / traded dollar volume */
  pctOfVolume: number
  perTrade: number
  perShare: number
  /** Closed trades that were profitable before fees but not after. */
  grossWinnersNetLosers: number
  grossWinRate: number
  netWinRate: number
  grossPnl: number
  netPnl: number
}

export function computeFeeStats(trades: Trade[]): FeeStats {
  const closed = closedOnly(trades)
  const total = sum(trades.map((t) => t.fees))
  const grossPnl = sum(closed.map((t) => t.grossPnl))
  const netPnl = sum(closed.map((t) => t.netPnl))
  const volume = sum(trades.flatMap((t) => t.fills.map((f) => f.qty * f.price)))
  const shares = sum(trades.flatMap((t) => t.fills.map((f) => f.qty)))

  const typeTotals = new Map<string, number>()
  for (const t of trades)
    for (const [k, v] of Object.entries(t.feeBreakdown))
      typeTotals.set(k, (typeTotals.get(k) ?? 0) + v)
  const byType = [...typeTotals.entries()]
    .map(([type, amount]) => ({ type, amount, share: total !== 0 ? amount / total : 0 }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

  const grossWinners = closed.filter((t) => t.grossPnl > 0).length
  const netWinners = closed.filter((t) => t.netPnl > 0).length

  return {
    total,
    byType,
    pctOfGross: grossPnl !== 0 ? total / Math.abs(grossPnl) : 0,
    pctOfVolume: volume > 0 ? total / volume : 0,
    perTrade: trades.length ? total / trades.length : 0,
    perShare: shares > 0 ? total / shares : 0,
    grossWinnersNetLosers: closed.filter((t) => t.grossPnl > 0 && t.netPnl <= 0).length,
    grossWinRate: closed.length ? grossWinners / closed.length : 0,
    netWinRate: closed.length ? netWinners / closed.length : 0,
    grossPnl,
    netPnl,
  }
}
