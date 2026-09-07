import { attributionDate, type Direction, type Trade, type TradeStatus } from '../trade'

export interface TradeFilter {
  /** Inclusive 'YYYY-MM-DD' bounds on the attribution date (exit date). */
  from?: string
  to?: string
  direction?: Direction
  symbols?: string[]
  status?: TradeStatus
  /** 'day' = closed same day, 'swing' = held overnight */
  holdType?: 'day' | 'swing'
}

export function filterTrades(trades: Trade[], f?: TradeFilter): Trade[] {
  if (!f) return trades
  const symbols = f.symbols && f.symbols.length ? new Set(f.symbols) : undefined
  return trades.filter((t) => {
    const d = attributionDate(t)
    if (f.from && d < f.from) return false
    if (f.to && d > f.to) return false
    if (f.direction && t.direction !== f.direction) return false
    if (f.status && t.status !== f.status) return false
    if (symbols && !symbols.has(t.symbol)) return false
    if (f.holdType === 'day' && t.isOvernight) return false
    if (f.holdType === 'swing' && !t.isOvernight) return false
    return true
  })
}

/** Only closed trades count towards performance statistics. */
export function closedOnly(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.status === 'closed')
}
