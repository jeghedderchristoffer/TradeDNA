import { hourOf, monthKey, weekdayOf, weekKey } from '@/lib/dates'
import { attributionDate, pnlOf, type PnlBasis, type Trade } from '../trade'
import { closedOnly } from './filter'
import { sum } from './summary'

export interface Bucket {
  key: string
  label: string
  trades: Trade[]
  count: number
  wins: number
  losses: number
  winRate: number
  grossPnl: number
  fees: number
  netPnl: number
  /** P&L in the requested basis. */
  pnl: number
  volume: number
}

export function makeBucket(key: string, label: string, trades: Trade[], basis: PnlBasis): Bucket {
  const closed = closedOnly(trades)
  const wins = closed.filter((t) => pnlOf(t, basis) > 0).length
  const losses = closed.filter((t) => pnlOf(t, basis) < 0).length
  const grossPnl = sum(closed.map((t) => t.grossPnl))
  const fees = sum(trades.map((t) => t.fees))
  const netPnl = sum(closed.map((t) => t.netPnl))
  return {
    key,
    label,
    trades,
    count: trades.length,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length : 0,
    grossPnl,
    fees,
    netPnl,
    pnl: basis === 'gross' ? grossPnl : netPnl,
    volume: sum(trades.flatMap((t) => t.fills.map((f) => f.qty * f.price))),
  }
}

export function groupTrades(
  trades: Trade[],
  keyFn: (t: Trade) => string,
  basis: PnlBasis,
  labelFn: (key: string) => string = (k) => k,
): Bucket[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const k = keyFn(t)
    const list = map.get(k)
    if (list) list.push(t)
    else map.set(k, [t])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, ts]) => makeBucket(k, labelFn(k), ts, basis))
}

/** Keyed by 'YYYY-MM-DD' attribution (exit) date. */
export function byDay(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, attributionDate, basis)
}

export function byWeek(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, (t) => weekKey(attributionDate(t)), basis)
}

export function byMonth(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, (t) => monthKey(attributionDate(t)), basis)
}

export function bySymbol(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, (t) => t.symbol, basis).sort((a, b) => b.pnl - a.pnl)
}

/**
 * One bucket per tag, best P&L first. A trade with several tags is counted in each of them, so
 * the buckets overlap and do not sum to the total. Untagged trades are left out.
 */
export function byTag(trades: Trade[], basis: PnlBasis): Bucket[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    for (const tag of t.tags ?? []) {
      const list = map.get(tag)
      if (list) list.push(t)
      else map.set(tag, [t])
    }
  }
  return [...map.entries()]
    .map(([tag, ts]) => makeBucket(tag, tag, ts, basis))
    .sort((a, b) => b.pnl - a.pnl || b.count - a.count)
}

export function byDirection(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(
    trades,
    (t) => t.direction,
    basis,
    (k) => (k === 'long' ? 'Long' : 'Short'),
  )
}

export function byHoldType(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(
    trades,
    (t) => (t.isOvernight ? 'swing' : 'day'),
    basis,
    (k) => (k === 'day' ? 'Day trades' : 'Overnight / swing'),
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Grouped by weekday of ENTRY, Monday..Sunday order, empty days included (Mon-Fri always shown). */
export function byWeekday(trades: Trade[], basis: PnlBasis): Bucket[] {
  const buckets = groupTrades(trades, (t) => String(weekdayOf(t.entryTime)), basis)
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  const order = [1, 2, 3, 4, 5, 6, 0]
  return order
    .filter((d) => (d >= 1 && d <= 5) || byKey.has(String(d)))
    .map((d) => byKey.get(String(d)) ?? makeBucket(String(d), WEEKDAYS[d]!, [], basis))
    .map((b) => ({ ...b, label: WEEKDAYS[Number(b.key)]! }))
}

/** Grouped by hour of ENTRY (market tz). Only hours present in the data, ascending. */
export function byHour(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(
    trades,
    (t) => String(hourOf(t.entryTime)).padStart(2, '0'),
    basis,
    (k) => `${k}:00`,
  )
}
