import { describe, expect, it } from 'vitest'
import type { Execution, Side } from './execution'
import { matchExecutions } from './matcher'
import { zonedToEpoch } from '@/lib/dates'

let seq = 0
function ex(
  side: Side,
  qty: number,
  price: number,
  at: string, // 'YYYY-MM-DD HH:mm:ss' Eastern
  extra: Partial<Execution> = {},
): Execution {
  const [d, t] = at.split(' ') as [string, string]
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number]
  const [hh, mm, ss] = t.split(':').map(Number) as [number, number, number]
  const timestamp = zonedToEpoch(y, m, dd, hh, mm, ss)
  const signed = side === 'buy' || side === 'cover' ? -qty * price : qty * price
  const fees = extra.fees ?? 1
  return {
    id: `e${++seq}`,
    broker: 'tradezero',
    symbol: 'ABC',
    side,
    qty,
    price,
    timestamp,
    tradeDate: d,
    fees,
    grossProceeds: signed,
    netProceeds: signed - fees,
    currency: 'USD',
    importBatchId: 'b1',
    sequence: seq,
    ...extra,
  }
}

describe('matchExecutions', () => {
  it('matches a simple long round trip', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 09:30:00'),
      ex('sell', 100, 11, '2026-08-03 09:45:00'),
    ])
    expect(r.unmatched).toEqual([])
    expect(r.trades).toHaveLength(1)
    const t = r.trades[0]!
    expect(t.direction).toBe('long')
    expect(t.status).toBe('closed')
    expect(t.grossPnl).toBeCloseTo(100)
    expect(t.fees).toBeCloseTo(2)
    expect(t.netPnl).toBeCloseTo(98)
    expect(t.holdMs).toBe(15 * 60_000)
    expect(t.isOvernight).toBe(false)
    expect(t.daysHeld).toBe(0)
    expect(t.entryDate).toBe('2026-08-03')
    expect(t.exitDate).toBe('2026-08-03')
    expect(t.returnPct).toBeCloseTo(9.8)
  })

  it('matches a short round trip with profit when price falls', () => {
    const r = matchExecutions([
      ex('short', 50, 20, '2026-08-03 10:00:00'),
      ex('cover', 50, 18, '2026-08-03 10:30:00'),
    ])
    const t = r.trades[0]!
    expect(t.direction).toBe('short')
    expect(t.grossPnl).toBeCloseTo(100)
    expect(t.avgEntry).toBe(20)
    expect(t.avgExit).toBe(18)
  })

  it('handles scaling in and out with averaged prices', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 09:30:00'),
      ex('buy', 100, 12, '2026-08-03 09:31:00'),
      ex('sell', 50, 13, '2026-08-03 09:40:00'),
      ex('sell', 150, 14, '2026-08-03 09:50:00'),
    ])
    expect(r.trades).toHaveLength(1)
    const t = r.trades[0]!
    expect(t.qty).toBe(200)
    expect(t.avgEntry).toBe(11)
    expect(t.avgExit).toBeCloseTo((50 * 13 + 150 * 14) / 200)
    expect(t.grossPnl).toBeCloseTo(50 * 13 + 150 * 14 - 2200)
    expect(t.fills).toHaveLength(4)
  })

  it('splits a fill that flips through zero into two trades', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 09:30:00'),
      ex('short', 150, 11, '2026-08-03 09:40:00', { fees: 3 }),
      ex('cover', 50, 9, '2026-08-03 09:50:00'),
    ])
    expect(r.unmatched).toEqual([])
    expect(r.trades).toHaveLength(2)
    const [long, short] = r.trades as [
      NonNullable<(typeof r.trades)[0]>,
      NonNullable<(typeof r.trades)[1]>,
    ]
    expect(long.direction).toBe('long')
    expect(long.grossPnl).toBeCloseTo(100)
    expect(long.fees).toBeCloseTo(1 + 3 * (100 / 150))
    expect(short.direction).toBe('short')
    expect(short.qty).toBe(50)
    expect(short.grossPnl).toBeCloseTo(50 * 11 - 50 * 9)
    expect(short.fees).toBeCloseTo(3 * (50 / 150) + 1)
    // both trades reference the split execution
    expect(long.executionIds).toContain(short.executionIds[0])
  })

  it('sorts out-of-order input by timestamp', () => {
    const r = matchExecutions([
      ex('sell', 100, 11, '2026-08-03 09:45:00'),
      ex('buy', 100, 10, '2026-08-03 09:30:00'),
    ])
    expect(r.unmatched).toEqual([])
    expect(r.trades[0]!.grossPnl).toBeCloseTo(100)
  })

  it('reports orphan closing fills instead of inventing a position', () => {
    const r = matchExecutions([
      ex('sell', 100, 11, '2026-08-03 09:45:00'),
      ex('buy', 100, 10, '2026-08-03 10:00:00'),
      ex('sell', 100, 12, '2026-08-03 10:30:00'),
    ])
    expect(r.trades).toHaveLength(1)
    expect(r.unmatched).toHaveLength(1)
    expect(r.unmatched[0]!.reason).toBe('orphan-close')
    expect(r.warnings).toHaveLength(1)
  })

  it('flags a sell larger than the long position without opening a short', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 09:30:00'),
      ex('sell', 120, 11, '2026-08-03 09:45:00'),
    ])
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]!.status).toBe('closed')
    expect(r.unmatched[0]).toMatchObject({ reason: 'over-close', qty: 20 })
  })

  it('keeps an unclosed position as an open trade', () => {
    const asOf = zonedToEpoch(2026, 8, 5, 12, 0, 0)
    const r = matchExecutions(
      [ex('buy', 100, 10, '2026-08-03 09:30:00'), ex('sell', 40, 12, '2026-08-03 10:00:00')],
      { asOf },
    )
    const t = r.trades[0]!
    expect(t.status).toBe('open')
    expect(t.openQty).toBe(60)
    expect(t.grossPnl).toBeCloseTo(40 * 2) // realized portion only
    expect(t.exitDate).toBeUndefined()
    expect(t.daysHeld).toBe(2)
    expect(t.isOvernight).toBe(true)
  })

  it('treats a multi-day hold as one overnight trade attributed to the exit day', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 15:59:00'),
      ex('sell', 50, 11, '2026-08-04 09:31:00'),
      ex('sell', 50, 12, '2026-08-05 09:31:00'),
    ])
    expect(r.trades).toHaveLength(1)
    const t = r.trades[0]!
    expect(t.isOvernight).toBe(true)
    expect(t.daysHeld).toBe(2)
    expect(t.entryDate).toBe('2026-08-03')
    expect(t.exitDate).toBe('2026-08-05')
    expect(t.grossPnl).toBeCloseTo(50 + 100)
  })

  it('treats an overnight short the same way', () => {
    const r = matchExecutions([
      ex('short', 100, 10, '2026-08-03 15:59:00'),
      ex('cover', 100, 9, '2026-08-04 09:31:00'),
    ])
    const t = r.trades[0]!
    expect(t.direction).toBe('short')
    expect(t.isOvernight).toBe(true)
    expect(t.daysHeld).toBe(1)
    expect(t.grossPnl).toBeCloseTo(100)
  })

  it('keeps symbols and accounts separate', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 09:30:00', { symbol: 'AAA' }),
      ex('buy', 100, 10, '2026-08-03 09:30:00', { symbol: 'BBB' }),
      ex('sell', 100, 11, '2026-08-03 09:31:00', { symbol: 'AAA' }),
      ex('sell', 100, 9, '2026-08-03 09:31:00', { symbol: 'BBB' }),
      ex('buy', 10, 10, '2026-08-03 09:30:00', { symbol: 'AAA', account: 'other' }),
    ])
    expect(r.trades).toHaveLength(3)
    expect(r.trades.filter((t) => t.status === 'open')).toHaveLength(1)
  })

  it('accumulates fee breakdown across fills', () => {
    const r = matchExecutions([
      ex('buy', 100, 10, '2026-08-03 09:30:00', { fees: 1.5, feeBreakdown: { Comm: 1, SEC: 0.5 } }),
      ex('sell', 100, 11, '2026-08-03 09:45:00', {
        fees: 1.25,
        feeBreakdown: { Comm: 1, TAF: 0.25 },
      }),
    ])
    expect(r.trades[0]!.feeBreakdown).toEqual({ Comm: 2, SEC: 0.5, TAF: 0.25 })
    expect(r.trades[0]!.fees).toBeCloseTo(2.75)
  })
})
