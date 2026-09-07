import { costOf, isAttributable, type CashEntry } from './cash-entry'
import type { Trade } from './trade'

export interface Allocation {
  /** Trades with locate/borrow costs folded into fees and net P&L. */
  trades: Trade[]
  /** Symbol-bearing entries for which no matching short trade exists (unused locates, credits for them...). */
  unallocated: CashEntry[]
  /** Everything that has no symbol: software, banking, unknown. */
  overhead: CashEntry[]
  allocatedCount: number
}

export const LOCATE_KEY = 'Locate'
export const BORROW_KEY = 'Borrow'

/**
 * Attach cash-journal costs to the trades that caused them.
 *
 * - Locate fees / credits / single-use / pre-borrow: go to the SHORT trades in that symbol that
 *   were opened on the entry date (locates are bought the day you short). If several, split
 *   pro rata by position size. Fallback: a short in that symbol already open on that date.
 * - Overnight borrow ("for MM/DD"): goes to the short trade that was open over that night.
 * - Nothing matches → unallocated. These are typically locates you paid for and never used.
 */
export function allocateCashEntries(trades: Trade[], entries: CashEntry[]): Allocation {
  const shortsBySymbol = new Map<string, Trade[]>()
  for (const t of trades) {
    if (t.direction !== 'short') continue
    const list = shortsBySymbol.get(t.symbol)
    if (list) list.push(t)
    else shortsBySymbol.set(t.symbol, [t])
  }

  const extra = new Map<string, { locate: number; borrow: number }>()
  const unallocated: CashEntry[] = []
  const overhead: CashEntry[] = []
  let allocatedCount = 0

  for (const e of entries) {
    if (!isAttributable(e)) {
      overhead.push(e)
      continue
    }
    const shorts = shortsBySymbol.get(e.symbol!) ?? []
    const candidates =
      e.category === 'borrow' ? borrowCandidates(shorts, e) : locateCandidates(shorts, e)
    if (!candidates.length) {
      unallocated.push(e)
      continue
    }
    allocatedCount++
    const weight = candidates.reduce((a, t) => a + t.qty, 0) || candidates.length
    for (const t of candidates) {
      const share = weight === candidates.length ? 1 / candidates.length : t.qty / weight
      const cur = extra.get(t.id) ?? { locate: 0, borrow: 0 }
      if (e.category === 'borrow') cur.borrow += costOf(e) * share
      else cur.locate += costOf(e) * share
      extra.set(t.id, cur)
    }
  }

  const out = trades.map((t) => {
    const x = extra.get(t.id)
    if (!x) return t
    return applyExtraFees(t, x.locate, x.borrow)
  })

  return { trades: out, unallocated, overhead, allocatedCount }
}

function locateCandidates(shorts: Trade[], e: CashEntry): Trade[] {
  const sameDay = shorts.filter((t) => t.entryDate === e.date)
  if (sameDay.length) return sameDay
  // a short already open that day (locate renewed / added while holding)
  return shorts.filter(
    (t) => t.entryDate <= e.date && (t.exitDate === undefined || t.exitDate >= e.date),
  )
}

function borrowCandidates(shorts: Trade[], e: CashEntry): Trade[] {
  const night = e.forDate ?? e.date
  const held = shorts.filter(
    (t) => t.entryDate <= night && (t.exitDate === undefined || t.exitDate > night),
  )
  if (held.length) return held
  // charged on the exit day itself, or dates slightly off: anything overlapping
  return shorts.filter(
    (t) => t.entryDate <= night && (t.exitDate === undefined || t.exitDate >= night),
  )
}

export function applyExtraFees(t: Trade, locate: number, borrow: number): Trade {
  const fees = t.tradingFees + locate + borrow
  const feeBreakdown = { ...t.feeBreakdown }
  delete feeBreakdown[LOCATE_KEY]
  delete feeBreakdown[BORROW_KEY]
  if (locate !== 0) feeBreakdown[LOCATE_KEY] = locate
  if (borrow !== 0) feeBreakdown[BORROW_KEY] = borrow
  const netPnl = t.grossPnl - fees
  const entryCost = t.avgEntry * (t.qty || 1)
  return {
    ...t,
    locateFees: locate,
    borrowFees: borrow,
    fees,
    feeBreakdown,
    netPnl,
    returnPct: entryCost > 0 ? (netPnl / entryCost) * 100 : t.returnPct,
  }
}
