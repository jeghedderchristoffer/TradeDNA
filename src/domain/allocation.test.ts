import { describe, expect, it } from 'vitest'
import { allocateCashEntries } from './allocation'
import type { CashEntry } from './cash-entry'
import type { Trade } from './trade'

function trade(
  o: Partial<Trade> & {
    symbol: string
    direction: 'long' | 'short'
    entryDate: string
    exitDate?: string
  },
): Trade {
  return {
    id: `${o.symbol}-${o.entryDate}-${o.direction}`,
    status: o.exitDate ? 'closed' : 'open',
    entryTime: 0,
    exitTime: 0,
    isOvernight: !!o.exitDate && o.exitDate !== o.entryDate,
    daysHeld: 0,
    qty: 100,
    openQty: 0,
    avgEntry: 10,
    avgExit: 9,
    grossPnl: 100,
    fees: 2,
    tradingFees: 2,
    locateFees: 0,
    borrowFees: 0,
    feeBreakdown: { Comm: 2 },
    netPnl: 98,
    returnPct: 9.8,
    holdMs: 0,
    executionIds: [],
    fills: [],
    ...o,
  }
}

function entry(
  o: Partial<CashEntry> & { date: string; amount: number; category: CashEntry['category'] },
): CashEntry {
  return {
    id: `${o.date}-${o.amount}-${o.symbol}-${Math.random()}`,
    broker: 'tradezero',
    kind:
      o.category === 'borrow'
        ? 'overnight-borrow'
        : o.category === 'locate'
          ? 'locate'
          : 'platform',
    type: 'x',
    note: 'x',
    currency: 'USD',
    importBatchId: 'b',
    sequence: 0,
    ...o,
  }
}

describe('allocateCashEntries', () => {
  it('assigns a locate to the short opened that day and restates fees and net', () => {
    const t = trade({
      symbol: 'ABC',
      direction: 'short',
      entryDate: '2026-01-05',
      exitDate: '2026-01-05',
    })
    const a = allocateCashEntries(
      [t],
      [entry({ date: '2026-01-05', amount: -8, category: 'locate', symbol: 'ABC' })],
    )
    expect(a.allocatedCount).toBe(1)
    const out = a.trades[0]!
    expect(out.locateFees).toBe(8)
    expect(out.fees).toBe(10)
    expect(out.netPnl).toBe(90)
    expect(out.feeBreakdown).toEqual({ Comm: 2, Locate: 8 })
  })

  it('nets credits against locates and splits between several shorts pro rata', () => {
    const a = trade({
      symbol: 'ABC',
      direction: 'short',
      entryDate: '2026-01-05',
      exitDate: '2026-01-05',
      qty: 300,
    })
    const b = trade({
      symbol: 'ABC',
      direction: 'short',
      entryDate: '2026-01-05',
      exitDate: '2026-01-05',
      qty: 100,
      id: 'second',
    })
    const r = allocateCashEntries(
      [a, b],
      [
        entry({ date: '2026-01-05', amount: -8, category: 'locate', symbol: 'ABC' }),
        entry({
          date: '2026-01-05',
          amount: 4,
          category: 'locate',
          symbol: 'ABC',
          kind: 'locate-credit',
        }),
      ],
    )
    expect(r.trades[0]!.locateFees).toBeCloseTo(3) // 75% of net 4
    expect(r.trades[1]!.locateFees).toBeCloseTo(1)
  })

  it('never puts locates on longs, and reports locates with no short as unallocated', () => {
    const long = trade({
      symbol: 'ABC',
      direction: 'long',
      entryDate: '2026-01-05',
      exitDate: '2026-01-05',
    })
    const r = allocateCashEntries(
      [long],
      [entry({ date: '2026-01-05', amount: -8, category: 'locate', symbol: 'ABC' })],
    )
    expect(r.trades[0]!.locateFees).toBe(0)
    expect(r.unallocated).toHaveLength(1)
  })

  it('assigns overnight borrow to the short held over that night', () => {
    const swing = trade({
      symbol: 'XYZ',
      direction: 'short',
      entryDate: '2026-01-05',
      exitDate: '2026-01-07',
    })
    const dayTrade = trade({
      symbol: 'XYZ',
      direction: 'short',
      entryDate: '2026-01-06',
      exitDate: '2026-01-06',
      id: 'day',
    })
    const r = allocateCashEntries(
      [swing, dayTrade],
      [
        entry({
          date: '2026-01-07',
          amount: -3.5,
          category: 'borrow',
          symbol: 'XYZ',
          forDate: '2026-01-06',
        }),
      ],
    )
    expect(r.trades[0]!.borrowFees).toBe(3.5)
    expect(r.trades[1]!.borrowFees).toBe(0)
    expect(r.trades[0]!.feeBreakdown['Borrow']).toBe(3.5)
  })

  it('keeps symbol-less entries as overhead', () => {
    const r = allocateCashEntries(
      [],
      [entry({ date: '2026-01-01', amount: -59, category: 'software' })],
    )
    expect(r.overhead).toHaveLength(1)
    expect(r.unallocated).toHaveLength(0)
  })
})
