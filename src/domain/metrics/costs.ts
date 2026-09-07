import { costOf, type CashEntry } from '../cash-entry'
import type { Trade } from '../trade'
import { monthKey } from '@/lib/dates'
import { attributionDate } from '../trade'
import { closedOnly } from './filter'
import { sum } from './summary'

/** The full cost-of-trading picture for a period. */
export interface CostSummary {
  grossPnl: number
  /** Commissions + regulatory fees on fills. */
  tradingFees: number
  /** Locates attributed to trades (net of credits). */
  locateFees: number
  /** Overnight borrow attributed to trades. */
  borrowFees: number
  /** Costs on trades = trading + locate + borrow. */
  tradeCosts: number
  /** grossPnl − tradeCosts (what the Net toggle shows). */
  netPnl: number
  /** Locates (net of credits) that never matched a short trade. */
  unusedLocates: number
  /** Borrow charges that never matched a trade. */
  unmatchedBorrow: number
  software: number
  bankFees: number
  otherFees: number
  /** unusedLocates + unmatchedBorrow + software + bankFees + otherFees */
  overhead: number
  totalCosts: number
  /** netPnl − overhead: what actually happened to the account, excluding deposits/withdrawals. */
  bottomLine: number
  deposits: number
  withdrawals: number
  /** How much of the gross P&L was eaten by all costs (0 when gross is 0). */
  costPctOfGross: number
}

/**
 * @param trades   trades in range (already carrying allocated locate/borrow)
 * @param entries  cash entries in range that are NOT allocated to a trade (unallocated + overhead)
 */
export function computeCosts(trades: Trade[], entries: CashEntry[]): CostSummary {
  const closed = closedOnly(trades)
  const grossPnl = sum(closed.map((t) => t.grossPnl))
  const tradingFees = sum(trades.map((t) => t.tradingFees))
  const locateFees = sum(trades.map((t) => t.locateFees))
  const borrowFees = sum(trades.map((t) => t.borrowFees))
  const tradeCosts = tradingFees + locateFees + borrowFees

  const cost = (pred: (e: CashEntry) => boolean) => sum(entries.filter(pred).map(costOf))
  const unusedLocates = cost((e) => e.category === 'locate')
  const unmatchedBorrow = cost((e) => e.category === 'borrow')
  const software = cost((e) => e.category === 'software')
  const bankFees = cost((e) => e.kind === 'bank-fee')
  const otherFees = cost((e) => e.category === 'other')
  const deposits = sum(entries.filter((e) => e.kind === 'deposit').map((e) => e.amount))
  const withdrawals = -sum(entries.filter((e) => e.kind === 'withdrawal').map((e) => e.amount))

  const overhead = unusedLocates + unmatchedBorrow + software + bankFees + otherFees
  const totalCosts = tradeCosts + overhead
  const netPnl = grossPnl - tradeCosts
  return {
    grossPnl,
    tradingFees,
    locateFees,
    borrowFees,
    tradeCosts,
    netPnl,
    unusedLocates,
    unmatchedBorrow,
    software,
    bankFees,
    otherFees,
    overhead,
    totalCosts,
    bottomLine: netPnl - overhead,
    deposits,
    withdrawals,
    costPctOfGross: grossPnl !== 0 ? totalCosts / Math.abs(grossPnl) : 0,
  }
}

export interface MonthCosts {
  key: string
  trading: number
  locate: number
  borrow: number
  unusedLocates: number
  software: number
  other: number
  total: number
  grossPnl: number
  netPnl: number
  bottomLine: number
}

/** Costs per month; trade costs land on the trade's exit month, account costs on their own date. */
export function costsByMonth(trades: Trade[], entries: CashEntry[]): MonthCosts[] {
  const map = new Map<string, MonthCosts>()
  const get = (k: string) => {
    let m = map.get(k)
    if (!m) {
      m = {
        key: k,
        trading: 0,
        locate: 0,
        borrow: 0,
        unusedLocates: 0,
        software: 0,
        other: 0,
        total: 0,
        grossPnl: 0,
        netPnl: 0,
        bottomLine: 0,
      }
      map.set(k, m)
    }
    return m
  }
  for (const t of trades) {
    const m = get(monthKey(attributionDate(t)))
    m.trading += t.tradingFees
    m.locate += t.locateFees
    m.borrow += t.borrowFees
    if (t.status === 'closed') {
      m.grossPnl += t.grossPnl
      m.netPnl += t.netPnl
    }
  }
  for (const e of entries) {
    if (e.kind === 'deposit' || e.kind === 'withdrawal') continue
    const m = get(monthKey(e.date))
    if (e.category === 'locate') m.unusedLocates += costOf(e)
    else if (e.category === 'software') m.software += costOf(e)
    else m.other += costOf(e)
  }
  for (const m of map.values()) {
    m.total = m.trading + m.locate + m.borrow + m.unusedLocates + m.software + m.other
    m.bottomLine = m.netPnl - (m.unusedLocates + m.software + m.other)
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}

export interface SymbolCost {
  symbol: string
  trades: number
  grossPnl: number
  tradingFees: number
  locateFees: number
  borrowFees: number
  unusedLocates: number
  totalCosts: number
  netAfterAll: number
}

/** Per-symbol cost view including unused locates for that symbol. */
export function costsBySymbol(trades: Trade[], unallocated: CashEntry[]): SymbolCost[] {
  const map = new Map<string, SymbolCost>()
  const get = (s: string) => {
    let m = map.get(s)
    if (!m) {
      m = {
        symbol: s,
        trades: 0,
        grossPnl: 0,
        tradingFees: 0,
        locateFees: 0,
        borrowFees: 0,
        unusedLocates: 0,
        totalCosts: 0,
        netAfterAll: 0,
      }
      map.set(s, m)
    }
    return m
  }
  for (const t of trades) {
    const m = get(t.symbol)
    m.trades++
    if (t.status === 'closed') m.grossPnl += t.grossPnl
    m.tradingFees += t.tradingFees
    m.locateFees += t.locateFees
    m.borrowFees += t.borrowFees
  }
  for (const e of unallocated) {
    if (!e.symbol) continue
    const m = get(e.symbol)
    if (e.category === 'locate') m.unusedLocates += costOf(e)
    else m.borrowFees += costOf(e)
  }
  for (const m of map.values()) {
    m.totalCosts = m.tradingFees + m.locateFees + m.borrowFees + m.unusedLocates
    m.netAfterAll = m.grossPnl - m.totalCosts
  }
  return [...map.values()].sort((a, b) => b.totalCosts - a.totalCosts)
}

export function filterCashEntries(
  entries: CashEntry[],
  f?: { from?: string; to?: string },
): CashEntry[] {
  if (!f || (!f.from && !f.to)) return entries
  return entries.filter((e) => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to))
}
