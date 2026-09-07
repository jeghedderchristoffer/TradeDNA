import { pnlOf, type PnlBasis, type Trade } from '../trade'
import { closedOnly } from './filter'

export interface EquityPoint {
  /** Exit time of the trade that produced this point. */
  time: number
  date: string
  tradeId: string
  gross: number
  net: number
  fees: number
}

/** Cumulative realized P&L after each closed trade, in exit order. */
export function equityCurve(trades: Trade[]): EquityPoint[] {
  const closed = closedOnly(trades).sort((a, b) => a.exitTime! - b.exitTime!)
  let gross = 0
  let net = 0
  let fees = 0
  return closed.map((t) => {
    gross += t.grossPnl
    net += t.netPnl
    fees += t.fees
    return { time: t.exitTime!, date: t.exitDate!, tradeId: t.id, gross, net, fees }
  })
}

export interface DrawdownStats {
  /** Largest peak-to-trough decline in currency. Positive number. */
  maxDrawdown: number
  peakTime?: number
  troughTime?: number
}

export function maxDrawdown(curve: EquityPoint[], basis: PnlBasis): DrawdownStats {
  let peak = 0
  let peakTime: number | undefined
  let best: DrawdownStats = { maxDrawdown: 0 }
  for (const p of curve) {
    const v = basis === 'gross' ? p.gross : p.net
    if (v > peak) {
      peak = v
      peakTime = p.time
    }
    const dd = peak - v
    if (dd > best.maxDrawdown) best = { maxDrawdown: dd, peakTime, troughTime: p.time }
  }
  return best
}

export interface Streaks {
  maxWins: number
  maxLosses: number
  /** Positive = current winning streak, negative = losing streak. */
  current: number
}

export function streaks(trades: Trade[], basis: PnlBasis): Streaks {
  const closed = closedOnly(trades).sort((a, b) => a.exitTime! - b.exitTime!)
  let maxWins = 0
  let maxLosses = 0
  let run = 0
  for (const t of closed) {
    const p = pnlOf(t, basis)
    if (p > 0) run = run > 0 ? run + 1 : 1
    else if (p < 0) run = run < 0 ? run - 1 : -1
    else continue
    if (run > maxWins) maxWins = run
    if (-run > maxLosses) maxLosses = -run
  }
  return { maxWins, maxLosses, current: run }
}
