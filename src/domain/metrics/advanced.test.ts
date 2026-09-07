import { describe, expect, it } from 'vitest'
import { zonedToEpoch } from '@/lib/dates'
import type { Trade } from '../trade'
import { byDay, byWeek } from './buckets'
import {
  byPriceBand,
  byShareBand,
  byValueBand,
  computeConsistency,
  computeRisk,
  intradayCurve,
  pnlHistogram,
  stopTradingAt,
} from './advanced'

let n = 0
function trade(o: {
  net: number
  entry: string
  exit?: string
  price?: number
  qty?: number
}): Trade {
  const ts = (s: string) => {
    const [d, t] = s.split(' ') as [string, string]
    const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
    const [hh, mm] = t.split(':').map(Number) as [number, number]
    return zonedToEpoch(y, m, dd, hh, mm, 0)
  }
  const entryTime = ts(o.entry)
  const exitTime = ts(o.exit ?? o.entry.slice(0, 11) + '15:00')
  return {
    id: `t${++n}`,
    symbol: 'ABC',
    direction: 'long',
    status: 'closed',
    entryTime,
    exitTime,
    entryDate: o.entry.slice(0, 10),
    exitDate: (o.exit ?? o.entry).slice(0, 10),
    isOvernight: false,
    daysHeld: 0,
    qty: o.qty ?? 100,
    openQty: 0,
    avgEntry: o.price ?? 5,
    avgExit: 5,
    grossPnl: o.net + 1,
    fees: 1,
    tradingFees: 1,
    locateFees: 0,
    borrowFees: 0,
    feeBreakdown: {},
    netPnl: o.net,
    holdMs: exitTime - entryTime,
    executionIds: [],
    fills: [],
  }
}

const trades = [
  trade({ net: 100, entry: '2026-08-03 09:35', exit: '2026-08-03 09:50', price: 1.5, qty: 500 }),
  trade({ net: -50, entry: '2026-08-03 10:15', exit: '2026-08-03 10:20', price: 3, qty: 200 }),
  trade({ net: -150, entry: '2026-08-03 13:00', exit: '2026-08-03 13:30', price: 12, qty: 100 }),
  trade({ net: 40, entry: '2026-08-04 09:31', exit: '2026-08-04 09:40', price: 0.8, qty: 2000 }),
  trade({ net: -20, entry: '2026-08-05 11:00', exit: '2026-08-05 11:10', price: 7, qty: 50 }),
  trade({ net: 300, entry: '2026-08-06 09:45', exit: '2026-08-06 10:00', price: 25, qty: 300 }),
]

describe('advanced metrics', () => {
  it('computes R-based risk stats with 1R = average loss', () => {
    const r = computeRisk(trades, 'net')
    expect(r.rUnit).toBeCloseTo((50 + 150 + 20) / 3)
    expect(r.avgWinR).toBeCloseTo(440 / 3 / r.rUnit)
    expect(r.largestLossR).toBeCloseTo(-150 / r.rUnit)
    expect(r.payoffRatio).toBeCloseTo(440 / 3 / r.rUnit)
  })

  it('counts outsized losses beyond 2R', () => {
    const r = computeRisk(trades, 'net')
    expect(r.outsizedLosses).toBe(1)
    expect(r.pnlIfLossesCappedAt1R).toBeCloseTo(100 - 50 - r.rUnit - 20 + 40 + 300)
    expect(r.top5WinnersShare).toBe(1)
    expect(r.maxPositionValue).toBe(25 * 300)
  })

  it('builds a histogram with zero as a bin edge', () => {
    const bins = pnlHistogram(trades, 'net', 6)
    expect(bins.length).toBeGreaterThan(3)
    expect(bins.some((b) => b.from === 0)).toBe(true)
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(6)
    expect(bins.reduce((a, b) => a + b.pnl, 0)).toBeCloseTo(220)
  })

  it('buckets by price, shares and dollar value in a fixed order', () => {
    expect(byPriceBand(trades, 'net').map((b) => b.label)).toEqual([
      '< $1',
      '$1–2',
      '$2–5',
      '$5–10',
      '$10–20',
      '$20+',
    ])
    expect(byShareBand(trades, 'net').map((b) => b.label)).toEqual([
      '≤ 100 sh',
      '101–300',
      '301–500',
      '1,000+',
    ])
    const v = byValueBand(trades, 'net')
    expect(v.find((b) => b.label === '$5k–10k')!.netPnl).toBe(300) // 25 × 300 = 7,500
  })

  it('averages the intraday curve per trading day', () => {
    const curve = intradayCurve(trades, 'net', 30)
    const last = curve[curve.length - 1]!
    expect(last.avgCum).toBeCloseTo(220 / 4) // 4 trading days
    const ten = curve.find((p) => p.label === '10:00')!
    // trades exited by 10:00: 100 (09:50), 40 (09:40), 300 (10:00)
    expect(ten.avgCum).toBeCloseTo(440 / 4)
    expect(curve[0]!.label).toBe('04:00')
  })

  it('evaluates stopping at a cutoff time', () => {
    const rows = stopTradingAt(trades, 'net', ['10:00', '12:00'])
    expect(rows[0]).toMatchObject({ cutoff: '10:00', pnl: 440, delta: 220, tradesRemoved: 3 })
    expect(rows[1]).toMatchObject({ cutoff: '12:00', pnl: 370, tradesRemoved: 1 })
  })

  it('computes day-level consistency', () => {
    const c = computeConsistency(byDay(trades, 'net'), byWeek(trades, 'net'))
    expect(c.tradingDays).toBe(4)
    expect(c.greenDays).toBe(2) // Aug 4 (+40), Aug 6 (+300); Aug 3 = -100, Aug 5 = -20
    expect(c.redDays).toBe(2)
    expect(c.bestDay).toBe(300)
    expect(c.pnlWithoutBestDay).toBe(-80)
    expect(c.bestDayShare).toBeCloseTo(300 / 460)
    expect(c.maxRedStreak).toBe(1)
    expect(c.greenWeeks).toBe(1)
  })
})
