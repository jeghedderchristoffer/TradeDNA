export type Direction = 'long' | 'short'
export type TradeStatus = 'open' | 'closed'

/** The part of one execution that was applied to one trade (an execution can be split across two trades on a flip). */
export interface TradeFill {
  executionId: string
  role: 'entry' | 'exit'
  timestamp: number
  qty: number
  price: number
  /** Fees attributed to this fill (pro-rated if the execution was split). */
  fees: number
  feeBreakdown?: Record<string, number>
}

/** A round-trip position: opened from flat, closed back to flat (or still open). */
export interface Trade {
  /** Id of the first execution that opened the position (plus a suffix when a flip splits one execution). */
  id: string
  symbol: string
  account?: string
  direction: Direction
  status: TradeStatus
  entryTime: number
  exitTime?: number
  /** 'YYYY-MM-DD' market tz. */
  entryDate: string
  /** 'YYYY-MM-DD' market tz. Calendar and daily P&L attribute a trade to its exit date. */
  exitDate?: string
  /** True when the position was held across at least one market-day boundary. */
  isOvernight: boolean
  /** Calendar days from entry to exit (or to `asOf` for open trades). 0 = day trade. */
  daysHeld: number
  /** Largest absolute position size reached. */
  qty: number
  /** Shares still open (0 when closed). */
  openQty: number
  avgEntry: number
  avgExit?: number
  /** Realized P&L before fees. For open trades this covers the closed portion only. */
  grossPnl: number
  /** All costs attributed to this trade: tradingFees + locateFees + borrowFees. */
  fees: number
  /** Commissions and regulatory fees from the fills themselves. */
  tradingFees: number
  /** Locate fees (net of credits) attributed from the cash journal. */
  locateFees: number
  /** Overnight borrow charges attributed from the cash journal. */
  borrowFees: number
  feeBreakdown: Record<string, number>
  /** grossPnl - fees */
  netPnl: number
  /** netPnl as % of total entry cost. */
  returnPct?: number
  holdMs?: number
  executionIds: string[]
  fills: TradeFill[]
}

export function isWinner(t: Trade, basis: PnlBasis = 'net'): boolean {
  return pnlOf(t, basis) > 0
}

export type PnlBasis = 'gross' | 'net'

export function pnlOf(t: Trade, basis: PnlBasis): number {
  return basis === 'gross' ? t.grossPnl : t.netPnl
}

/** Date a trade is attributed to on the calendar: exit date when closed, entry date while open. */
export function attributionDate(t: Trade): string {
  return t.exitDate ?? t.entryDate
}
