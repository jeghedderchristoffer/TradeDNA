import { pnlOf, type PnlBasis, type Trade } from '../trade'
import { closedOnly } from './filter'

export interface Summary {
  basis: PnlBasis
  tradeCount: number
  closedCount: number
  openCount: number
  wins: number
  losses: number
  breakeven: number
  /** 0..1, wins / closed */
  winRate: number
  grossPnl: number
  fees: number
  netPnl: number
  /** The P&L for the chosen basis. */
  pnl: number
  /** fees / |grossPnl| (0 when gross is 0). */
  feePctOfGross: number
  /** Σ wins / |Σ losses|. Infinity when no losses. */
  profitFactor: number
  /** Average P&L per closed trade. */
  expectancy: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  avgReturnPct: number
  avgHoldMs: number
  medianHoldMs: number
  avgHoldWinnersMs: number
  avgHoldLosersMs: number
  longCount: number
  shortCount: number
  overnightCount: number
  /** Σ |qty × price| over all fills — the dollar volume traded. */
  volume: number
}

export function computeSummary(trades: Trade[], basis: PnlBasis = 'net'): Summary {
  const closed = closedOnly(trades)
  const pnls = closed.map((t) => pnlOf(t, basis))
  const winners = closed.filter((t) => pnlOf(t, basis) > 0)
  const losers = closed.filter((t) => pnlOf(t, basis) < 0)
  const winSum = sum(winners.map((t) => pnlOf(t, basis)))
  const lossSum = sum(losers.map((t) => pnlOf(t, basis)))
  const grossPnl = sum(closed.map((t) => t.grossPnl))
  const fees = sum(trades.map((t) => t.fees))
  const netPnl = sum(closed.map((t) => t.netPnl))
  const holds = closed.map((t) => t.holdMs ?? 0)

  return {
    basis,
    tradeCount: trades.length,
    closedCount: closed.length,
    openCount: trades.length - closed.length,
    wins: winners.length,
    losses: losers.length,
    breakeven: closed.length - winners.length - losers.length,
    winRate: closed.length ? winners.length / closed.length : 0,
    grossPnl,
    fees,
    netPnl,
    pnl: basis === 'gross' ? grossPnl : netPnl,
    feePctOfGross: grossPnl !== 0 ? fees / Math.abs(grossPnl) : 0,
    profitFactor: lossSum !== 0 ? winSum / Math.abs(lossSum) : winSum > 0 ? Infinity : 0,
    expectancy: closed.length ? sum(pnls) / closed.length : 0,
    avgWin: winners.length ? winSum / winners.length : 0,
    avgLoss: losers.length ? lossSum / losers.length : 0,
    largestWin: winners.length ? Math.max(...winners.map((t) => pnlOf(t, basis))) : 0,
    largestLoss: losers.length ? Math.min(...losers.map((t) => pnlOf(t, basis))) : 0,
    avgReturnPct: closed.length ? sum(closed.map((t) => t.returnPct ?? 0)) / closed.length : 0,
    avgHoldMs: mean(holds),
    medianHoldMs: median(holds),
    avgHoldWinnersMs: mean(winners.map((t) => t.holdMs ?? 0)),
    avgHoldLosersMs: mean(losers.map((t) => t.holdMs ?? 0)),
    longCount: trades.filter((t) => t.direction === 'long').length,
    shortCount: trades.filter((t) => t.direction === 'short').length,
    overnightCount: trades.filter((t) => t.isOvernight).length,
    volume: sum(trades.flatMap((t) => t.fills.map((f) => f.qty * f.price))),
  }
}

export function sum(xs: number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0
}

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}
