import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { allocateCashEntries } from '@/domain/allocation'
import { costOf } from '@/domain/cash-entry'
import { matchExecutions } from '@/domain/matcher'
import { computeCosts } from '@/domain/metrics'
import { parseCsv } from './csv'
import { detectImporter } from './registry'
import { tradezero } from './tradezero'
import { classify, tradezeroCash } from './tradezero-cash'

const cashCsv = readFileSync(path.resolve(__dirname, '../test-fixtures/tradezero-cash.csv'), 'utf8')
const tradesCsv = readFileSync(
  path.resolve(__dirname, '../test-fixtures/tradezero-trades.csv'),
  'utf8',
)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('TradeZero cash journal importer', () => {
  const parsed = parseCsv(cashCsv)

  it('is auto-detected and distinct from the trade history', () => {
    expect(detectImporter(parsed.headers)?.id).toBe('tradezero-cash')
    expect(detectImporter(parseCsv(tradesCsv).headers)?.id).toBe('tradezero-trades')
  })

  it('classifies every note format seen in the export', () => {
    expect(classify('Locate Fees', 'Locate 400 MOGO @ 0.02 per share', -8, '2025-07-02')).toEqual({
      category: 'locate',
      kind: 'locate',
      symbol: 'MOGO',
      qty: 400,
      ratePerShare: 0.02,
    })
    expect(
      classify('Locate Fees', 'Locate credit 100 MOGO @ 0.006 per share', 0.6, '2025-07-02'),
    ).toMatchObject({
      category: 'locate',
      kind: 'locate-credit',
      symbol: 'MOGO',
      qty: 100,
    })
    expect(
      classify('Locate Fees', 'Single-Use 500 AZI @ 0.01 per share', -5, '2025-07-02'),
    ).toMatchObject({
      kind: 'single-use',
      symbol: 'AZI',
    })
    expect(
      classify('Locate Fees', 'Pre-Borrow 100 XYZ @ 0.03 per share', -3, '2025-07-02'),
    ).toMatchObject({
      kind: 'pre-borrow',
      symbol: 'XYZ',
    })
    expect(
      classify(
        'Locate Fees',
        '62% Locate CreditLocate 100 INOD @ 0.0045 per share',
        0.28,
        '2025-07-02',
      ),
    ).toMatchObject({
      kind: 'locate-credit',
      symbol: 'INOD',
      qty: 100,
    })
    expect(
      classify('Locate & Borrow Charge', 'ONB 60 PPSI ($0.00417) for 08/15', -0.42, '2025-08-15'),
    ).toEqual({
      category: 'borrow',
      kind: 'overnight-borrow',
      symbol: 'PPSI',
      qty: 60,
      ratePerShare: 0.00417,
      forDate: '2025-08-15',
    })
    // negative rate (rebate) and reversal prefix still carry the symbol
    expect(
      classify('Locate & Borrow Charge', 'ONB 16 MBX ($-0.00058) for 09/22', 0.01, '2025-09-23'),
    ).toMatchObject({
      symbol: 'MBX',
      forDate: '2025-09-22',
    })
    expect(
      classify(
        'Locate & Borrow Charge',
        'REV:ONB 150 SLE ($-0.06118) for 05/15',
        9.18,
        '2026-05-18',
      ),
    ).toMatchObject({
      symbol: 'SLE',
      forDate: '2026-05-15',
    })
    // "for 12/30" seen on Jan 2 belongs to the previous year
    expect(
      classify('Locate & Borrow Charge', 'ONB 10 ABC ($0.01) for 12/30', -0.1, '2026-01-02')
        .forDate,
    ).toBe('2025-12-30')
    expect(classify('Software & Data', 'ZeroPro', -59, '2025-07-01')).toEqual({
      category: 'software',
      kind: 'platform',
    })
    expect(classify('Banking', 'Wire In', 4500, '2025-06-30')).toEqual({
      category: 'banking',
      kind: 'deposit',
    })
    expect(classify('Banking', 'Wire In Fee', -15, '2025-06-30')).toEqual({
      category: 'banking',
      kind: 'bank-fee',
    })
    expect(classify('Banking', 'Wire Out', -1000, '2025-06-30')).toEqual({
      category: 'banking',
      kind: 'withdrawal',
    })
    expect(classify('Mystery', 'something', -1, '2025-06-30')).toEqual({
      category: 'other',
      kind: 'unknown',
    })
  })

  it('imports the whole journal with the broker totals', () => {
    const { cashEntries, warnings, skippedRows } = tradezeroCash.parse(parsed.rows, {
      importBatchId: 'c',
    })
    expect(skippedRows).toBe(0)
    expect(warnings).toEqual([])
    expect(cashEntries).toHaveLength(622)

    const byCat = (c: string) => cashEntries.filter((e) => e.category === c)
    expect(byCat('locate')).toHaveLength(575)
    expect(sum(byCat('locate').map(costOf))).toBeCloseTo(2012.73 - 62.23, 2)
    expect(byCat('borrow')).toHaveLength(29)
    expect(sum(byCat('borrow').map(costOf))).toBeCloseTo(302.6 - 24.48, 2)
    expect(byCat('software')).toHaveLength(16)
    expect(sum(byCat('software').map(costOf))).toBeCloseTo(885 - 59, 2)
    expect(byCat('banking')).toHaveLength(2)

    // every locate/borrow row carries a symbol, so it can be attributed
    expect(
      cashEntries.filter((e) => (e.category === 'locate' || e.category === 'borrow') && !e.symbol),
    ).toEqual([])
    expect(byCat('borrow').every((e) => e.forDate)).toBe(true)

    // ids are stable and unique, even for identical repeated rows
    const again = tradezeroCash.parse(parsed.rows, { importBatchId: 'd' }).cashEntries
    expect(new Set(cashEntries.map((e) => e.id)).size).toBe(622)
    expect(again.map((e) => e.id)).toEqual(cashEntries.map((e) => e.id))
  })

  it('attributes locates and borrow to the short trades that caused them', () => {
    const trades = matchExecutions(
      tradezero.parse(parseCsv(tradesCsv).rows, { importBatchId: 't' }).executions,
    ).trades
    const entries = tradezeroCash.parse(parsed.rows, { importBatchId: 'c' }).cashEntries
    const a = allocateCashEntries(trades, entries)

    expect(a.overhead).toHaveLength(18) // 16 software + 2 banking
    expect(a.allocatedCount).toBeGreaterThan(520)
    expect(a.unallocated.length).toBeLessThan(60)
    // only locates can be "unused"; every borrow charge belongs to a held position
    expect(a.unallocated.filter((e) => e.category === 'borrow')).toEqual([])

    const locate = sum(a.trades.map((t) => t.locateFees))
    const unused = sum(a.unallocated.map(costOf))
    expect(locate + unused).toBeCloseTo(2012.73 - 62.23 - 0, 1)
    expect(sum(a.trades.map((t) => t.borrowFees))).toBeCloseTo(302.6 - 24.48, 1)
    // only shorts carry locate/borrow costs
    expect(
      a.trades
        .filter((t) => t.direction === 'long')
        .every((t) => t.locateFees === 0 && t.borrowFees === 0),
    ).toBe(true)
    // fees & net are restated on the trade
    const withLocate = a.trades.find((t) => t.locateFees > 0)!
    expect(withLocate.fees).toBeCloseTo(
      withLocate.tradingFees + withLocate.locateFees + withLocate.borrowFees,
      6,
    )
    expect(withLocate.netPnl).toBeCloseTo(withLocate.grossPnl - withLocate.fees, 6)
    expect(withLocate.feeBreakdown['Locate']).toBeCloseTo(withLocate.locateFees, 6)

    const costs = computeCosts(a.trades, [...a.unallocated, ...a.overhead])
    expect(costs.grossPnl).toBeCloseTo(2865.53, 2)
    expect(costs.tradingFees).toBeCloseTo(2824.94, 2)
    expect(costs.software).toBeCloseTo(826, 2)
    expect(costs.bankFees).toBeCloseTo(15, 2)
    expect(costs.deposits).toBeCloseTo(4500, 2)
    // total costs = everything the broker charged, regardless of attribution
    expect(costs.totalCosts).toBeCloseTo(
      2824.94 + (2012.73 - 62.23) + (302.6 - 24.48) + 826 + 15,
      1,
    )
    expect(costs.bottomLine).toBeCloseTo(2865.53 - costs.totalCosts, 1)
  })
})
