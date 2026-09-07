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
  const rows = parsed.rows
  const ofType = (t: string) => rows.filter((r) => r['Type'] === t)
  const costOfRows = (rs: Record<string, string>[]) =>
    sum(rs.map((r) => Number(r['Withdraw']) - Number(r['Deposit'])))
  const locateCost = costOfRows(ofType('Locate Fees'))
  const borrowCost = costOfRows(ofType('Locate & Borrow Charge'))
  const softwareCost = costOfRows(ofType('Software & Data'))
  const bankFee = costOfRows(ofType('Banking').filter((r) => /fee/i.test(r['Note']!)))
  const deposits = sum(
    ofType('Banking')
      .filter((r) => !/fee/i.test(r['Note']!))
      .map((r) => Number(r['Deposit'])),
  )

  it('is auto-detected and distinct from the trade history', () => {
    expect(detectImporter(parsed.headers)?.id).toBe('tradezero-cash')
    expect(detectImporter(parseCsv(tradesCsv).headers)?.id).toBe('tradezero-trades')
  })

  it('classifies every note format seen in real exports', () => {
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
    const { cashEntries, warnings, skippedRows } = tradezeroCash.parse(rows, { importBatchId: 'c' })
    expect(skippedRows).toBe(0)
    expect(warnings).toEqual([])
    expect(cashEntries).toHaveLength(rows.length)
    expect(rows.length).toBeGreaterThan(200)

    const byCat = (c: string) => cashEntries.filter((e) => e.category === c)
    expect(byCat('locate')).toHaveLength(ofType('Locate Fees').length)
    expect(sum(byCat('locate').map(costOf))).toBeCloseTo(locateCost, 2)
    expect(byCat('borrow')).toHaveLength(ofType('Locate & Borrow Charge').length)
    expect(sum(byCat('borrow').map(costOf))).toBeCloseTo(borrowCost, 2)
    expect(byCat('software')).toHaveLength(ofType('Software & Data').length)
    expect(sum(byCat('software').map(costOf))).toBeCloseTo(softwareCost, 2)
    expect(byCat('banking')).toHaveLength(ofType('Banking').length)

    // all locate note variants appear and every locate/borrow row carries a symbol
    const kinds = new Set(cashEntries.map((e) => e.kind))
    for (const k of [
      'locate',
      'locate-credit',
      'single-use',
      'pre-borrow',
      'overnight-borrow',
      'platform',
      'deposit',
      'bank-fee',
    ])
      expect(kinds.has(k as never)).toBe(true)
    expect(
      cashEntries.filter((e) => (e.category === 'locate' || e.category === 'borrow') && !e.symbol),
    ).toEqual([])
    expect(byCat('borrow').every((e) => e.forDate)).toBe(true)

    // ids are stable and unique, even for identical repeated rows
    const again = tradezeroCash.parse(rows, { importBatchId: 'd' }).cashEntries
    expect(new Set(cashEntries.map((e) => e.id)).size).toBe(rows.length)
    expect(again.map((e) => e.id)).toEqual(cashEntries.map((e) => e.id))
  })

  it('attributes locates and borrow to the short trades that caused them', () => {
    const trades = matchExecutions(
      tradezero.parse(parseCsv(tradesCsv).rows, { importBatchId: 't' }).executions,
    ).trades
    const entries = tradezeroCash.parse(rows, { importBatchId: 'c' }).cashEntries
    const a = allocateCashEntries(trades, entries)

    expect(a.overhead).toHaveLength(ofType('Software & Data').length + ofType('Banking').length)
    expect(a.allocatedCount).toBeGreaterThan(entries.length * 0.8)
    // only locates can be "unused"; every borrow charge belongs to a held position
    expect(a.unallocated.length).toBeGreaterThan(0)
    expect(a.unallocated.every((e) => e.category === 'locate')).toBe(true)

    const locate = sum(a.trades.map((t) => t.locateFees))
    const unused = sum(a.unallocated.map(costOf))
    expect(locate + unused).toBeCloseTo(locateCost, 1)
    expect(sum(a.trades.map((t) => t.borrowFees))).toBeCloseTo(borrowCost, 1)
    // only shorts carry locate/borrow costs
    expect(
      a.trades
        .filter((t) => t.direction === 'long')
        .every((t) => t.locateFees === 0 && t.borrowFees === 0),
    ).toBe(true)
    // fees & net are restated on the trade
    const withBoth = a.trades.find((t) => t.locateFees > 0 && t.borrowFees > 0)!
    expect(withBoth).toBeTruthy()
    expect(withBoth.isOvernight).toBe(true)
    expect(withBoth.fees).toBeCloseTo(
      withBoth.tradingFees + withBoth.locateFees + withBoth.borrowFees,
      6,
    )
    expect(withBoth.netPnl).toBeCloseTo(withBoth.grossPnl - withBoth.fees, 6)
    expect(withBoth.feeBreakdown['Locate']).toBeCloseTo(withBoth.locateFees, 6)
    expect(withBoth.feeBreakdown['Borrow']).toBeCloseTo(withBoth.borrowFees, 6)

    const tradeRows = parseCsv(tradesCsv).rows
    const grossTotal = sum(tradeRows.map((r) => Number(r['Gross Proceeds'])))
    const commTotal = grossTotal - sum(tradeRows.map((r) => Number(r['Net Proceeds'])))
    const costs = computeCosts(a.trades, [...a.unallocated, ...a.overhead])
    expect(costs.grossPnl).toBeCloseTo(grossTotal, 2)
    expect(costs.tradingFees).toBeCloseTo(commTotal, 2)
    expect(costs.software).toBeCloseTo(softwareCost, 2)
    expect(costs.bankFees).toBeCloseTo(bankFee, 2)
    expect(costs.deposits).toBeCloseTo(deposits, 2)
    // total costs = everything the broker charged, regardless of attribution
    expect(costs.totalCosts).toBeCloseTo(
      commTotal + locateCost + borrowCost + softwareCost + bankFee,
      1,
    )
    expect(costs.bottomLine).toBeCloseTo(grossTotal - costs.totalCosts, 1)
  })
})
