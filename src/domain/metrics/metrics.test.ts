import { describe, expect, it } from 'vitest'
import { zonedToEpoch } from '@/lib/dates'
import type { Trade } from '../trade'
import {
  byDay,
  byDirection,
  byHoldType,
  byWeekday,
  computeFeeStats,
  computeSummary,
  equityCurve,
  filterTrades,
  maxDrawdown,
  streaks,
} from './index'

function trade(o: {
  gross: number
  fees: number
  dir?: 'long' | 'short'
  entry: string // 'YYYY-MM-DD HH:mm'
  exit?: string
  symbol?: string
}): Trade {
  const toTs = (s: string) => {
    const [d, t] = s.split(' ') as [string, string]
    const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
    const [hh, mm] = t.split(':').map(Number) as [number, number]
    return zonedToEpoch(y, m, dd, hh, mm, 0)
  }
  const entryTime = toTs(o.entry)
  const exitTime = o.exit ? toTs(o.exit) : undefined
  const entryDate = o.entry.slice(0, 10)
  const exitDate = o.exit?.slice(0, 10)
  return {
    id: `t${entryTime}${o.symbol ?? ''}`,
    symbol: o.symbol ?? 'ABC',
    direction: o.dir ?? 'long',
    status: exitTime ? 'closed' : 'open',
    entryTime,
    exitTime,
    entryDate,
    exitDate,
    isOvernight: !!exitDate && exitDate !== entryDate,
    daysHeld: 0,
    qty: 100,
    openQty: exitTime ? 0 : 100,
    avgEntry: 10,
    avgExit: 10 + o.gross / 100,
    grossPnl: o.gross,
    fees: o.fees,
    tradingFees: o.fees,
    locateFees: 0,
    borrowFees: 0,
    feeBreakdown: { Comm: o.fees * 0.8, SEC: o.fees * 0.2 },
    netPnl: o.gross - o.fees,
    returnPct: (o.gross - o.fees) / 10,
    holdMs: exitTime ? exitTime - entryTime : undefined,
    executionIds: [],
    fills: [
      {
        executionId: 'a',
        role: 'entry',
        timestamp: entryTime,
        qty: 100,
        price: 10,
        fees: o.fees / 2,
      },
      ...(exitTime
        ? [
            {
              executionId: 'b',
              role: 'exit' as const,
              timestamp: exitTime,
              qty: 100,
              price: 10 + o.gross / 100,
              fees: o.fees / 2,
            },
          ]
        : []),
    ],
  }
}

const trades: Trade[] = [
  trade({ gross: 100, fees: 2, entry: '2026-08-03 09:30', exit: '2026-08-03 09:45' }), // win
  trade({ gross: -50, fees: 2, entry: '2026-08-03 10:00', exit: '2026-08-03 10:30' }), // loss
  trade({ gross: 1, fees: 2, dir: 'short', entry: '2026-08-04 09:30', exit: '2026-08-04 09:35' }), // gross win, net loss
  trade({ gross: 200, fees: 4, dir: 'short', entry: '2026-08-04 15:59', exit: '2026-08-05 09:31' }), // overnight win
  trade({ gross: 0, fees: 1, entry: '2026-08-06 09:30' }), // open
]

describe('metrics', () => {
  it('computes the summary on a net basis by default', () => {
    const s = computeSummary(trades)
    expect(s.tradeCount).toBe(5)
    expect(s.closedCount).toBe(4)
    expect(s.openCount).toBe(1)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(2)
    expect(s.winRate).toBe(0.5)
    expect(s.grossPnl).toBe(251)
    expect(s.fees).toBe(11) // includes the open trade's fees
    expect(s.netPnl).toBe(241)
    expect(s.pnl).toBe(241)
    expect(s.profitFactor).toBeCloseTo((98 + 196) / (52 + 1))
    expect(s.expectancy).toBeCloseTo(241 / 4)
    expect(s.largestWin).toBe(196)
    expect(s.largestLoss).toBe(-52)
    expect(s.longCount).toBe(3)
    expect(s.shortCount).toBe(2)
    expect(s.overnightCount).toBe(1)
    expect(s.avgHoldWinnersMs).toBeGreaterThan(s.avgHoldLosersMs)
  })

  it('switches win/loss classification with the gross basis', () => {
    const s = computeSummary(trades, 'gross')
    expect(s.wins).toBe(3)
    expect(s.losses).toBe(1)
    expect(s.pnl).toBe(251)
  })

  it('buckets by exit day, direction and hold type', () => {
    const days = byDay(trades, 'net')
    expect(days.map((d) => d.key)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'])
    expect(days[0]!.netPnl).toBe(46)
    expect(days[2]!.netPnl).toBe(196) // overnight trade lands on its exit day

    const dirs = byDirection(trades, 'net')
    expect(dirs.find((b) => b.key === 'short')!.netPnl).toBe(195)

    const hold = byHoldType(trades, 'net')
    expect(hold.find((b) => b.key === 'swing')!.count).toBe(1)
  })

  it('always shows Monday to Friday in weekday buckets', () => {
    const wd = byWeekday(trades, 'net')
    expect(wd.map((b) => b.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    expect(wd[0]!.count).toBe(2) // 2026-08-03 is a Monday
  })

  it('builds an equity curve and drawdown', () => {
    const curve = equityCurve(trades)
    expect(curve.map((p) => p.net)).toEqual([98, 46, 45, 241])
    expect(curve.map((p) => p.gross)).toEqual([100, 50, 51, 251])
    expect(maxDrawdown(curve, 'net').maxDrawdown).toBe(53)
    expect(streaks(trades, 'net')).toEqual({ maxWins: 1, maxLosses: 2, current: 1 })
  })

  it('computes fee statistics', () => {
    const f = computeFeeStats(trades)
    expect(f.total).toBe(11)
    expect(f.byType.map((b) => b.type)).toEqual(['Comm', 'SEC'])
    expect(f.byType[0]!.amount).toBeCloseTo(8.8)
    expect(f.byType[0]!.share).toBeCloseTo(0.8)
    expect(f.grossWinnersNetLosers).toBe(1)
    expect(f.grossWinRate).toBe(0.75)
    expect(f.netWinRate).toBe(0.5)
    expect(f.pctOfGross).toBeCloseTo(11 / 251)
    expect(f.perTrade).toBeCloseTo(11 / 5)
  })

  it('filters by date range, direction and hold type', () => {
    expect(filterTrades(trades, { from: '2026-08-04', to: '2026-08-04' })).toHaveLength(1)
    expect(filterTrades(trades, { direction: 'short' })).toHaveLength(2)
    expect(filterTrades(trades, { holdType: 'swing' })).toHaveLength(1)
    expect(filterTrades(trades, { status: 'open' })).toHaveLength(1)
    expect(filterTrades(trades, { symbols: ['ZZZ'] })).toHaveLength(0)
  })
})
