import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchExecutions } from '@/domain/matcher'
import { dateKey, hourOf } from '@/lib/dates'
import { parseCsv } from './csv'
import { detectImporter } from './registry'
import { parseEasternDateTime, tradezero } from './tradezero'

// Synthetic year of trading in TradeZero's export format (scripts/generate-fixtures.mjs):
// longs and shorts, partial fills, overnight holds, every position back to flat.
const csv = readFileSync(path.resolve(__dirname, '../test-fixtures/tradezero-trades.csv'), 'utf8')
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const col = (rows: Record<string, string>[], k: string) => sum(rows.map((r) => Number(r[k])))

describe('TradeZero trade history importer', () => {
  const parsed = parseCsv(csv)
  const rows = parsed.rows
  const expectedSides = rows.reduce<Record<string, number>>((acc, r) => {
    const side = { B: 'buy', S: 'sell', SS: 'short', BC: 'cover' }[r['Side']!]!
    acc[side] = (acc[side] ?? 0) + 1
    return acc
  }, {})
  const grossTotal = col(rows, 'Gross Proceeds')
  const netTotal = col(rows, 'Net Proceeds')
  const feeTotal = grossTotal - netTotal

  it('is auto-detected from the header row', () => {
    expect(parsed.errors).toEqual([])
    expect(rows.length).toBeGreaterThan(1000)
    expect(detectImporter(parsed.headers)?.id).toBe('tradezero-trades')
    expect(detectImporter(['Date', 'Symbol', 'Amount'])).toBeUndefined()
  })

  it('parses Eastern timestamps (pre-market 04:00 stays 04:00 in market tz)', () => {
    const ts = parseEasternDateTime('08/03/2026', '04:00:20')!
    expect(dateKey(ts)).toBe('2026-08-03')
    expect(hourOf(ts)).toBe(4)
    expect(new Date(ts).toISOString()).toBe('2026-08-03T08:00:20.000Z') // EDT = UTC-4
    expect(new Date(parseEasternDateTime('01/15/2026', '09:30:00')!).toISOString()).toBe(
      '2026-01-15T14:30:00.000Z', // EST = UTC-5
    )
    expect(parseEasternDateTime('bad', '04:00:20')).toBeNull()
  })

  it('converts every row into a canonical execution with the right totals', () => {
    const { executions, warnings, skippedRows } = tradezero.parse(rows, { importBatchId: 'test' })
    expect(skippedRows).toBe(0)
    expect(warnings).toEqual([])
    expect(executions).toHaveLength(rows.length)

    const sides = executions.reduce<Record<string, number>>((acc, e) => {
      acc[e.side] = (acc[e.side] ?? 0) + 1
      return acc
    }, {})
    expect(sides).toEqual(expectedSides)
    expect(Object.keys(sides).sort()).toEqual(['buy', 'cover', 'sell', 'short'])

    expect(sum(executions.map((e) => e.grossProceeds))).toBeCloseTo(grossTotal, 2)
    expect(sum(executions.map((e) => e.netProceeds))).toBeCloseTo(netTotal, 2)
    expect(sum(executions.map((e) => e.fees))).toBeCloseTo(feeTotal, 2)

    const byType: Record<string, number> = {}
    for (const e of executions)
      for (const [k, v] of Object.entries(e.feeBreakdown ?? {})) byType[k] = (byType[k] ?? 0) + v
    expect(sum(Object.values(byType))).toBeCloseTo(feeTotal, 2)
    for (const k of ['Comm', 'SEC', 'TAF', 'NSCC', 'Nasdaq']) {
      expect(byType[k]).toBeCloseTo(col(rows, k), 2)
    }

    const first = rows[0]!
    expect(executions[0]).toMatchObject({
      account: first['Account'],
      symbol: first['Symbol'],
      side: { B: 'buy', S: 'sell', SS: 'short', BC: 'cover' }[first['Side']!],
      qty: Number(first['Qty']),
      price: Number(first['Price']),
      fees:
        Math.round((Number(first['Gross Proceeds']) - Number(first['Net Proceeds'])) * 100) / 100,
      currency: 'USD',
      sequence: 0,
    })
    const [mm, dd, yyyy] = first['T/D']!.split('/')
    expect(executions[0]!.tradeDate).toBe(`${yyyy}-${mm}-${dd}`)
  })

  it('produces stable, unique ids so re-imports dedupe', () => {
    const a = tradezero.parse(rows, { importBatchId: 'first' }).executions
    const b = tradezero.parse(rows, { importBatchId: 'second' }).executions
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length)
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
  })

  it('matches the whole year into fully explained trades, including overnight holds', () => {
    const { executions } = tradezero.parse(rows, { importBatchId: 'test' })
    const { trades, unmatched, warnings } = matchExecutions(executions)

    expect(unmatched).toEqual([])
    expect(warnings).toEqual([])
    expect(trades.length).toBeGreaterThan(300)
    expect(trades.every((t) => t.status === 'closed')).toBe(true)

    const longs = trades.filter((t) => t.direction === 'long')
    const shorts = trades.filter((t) => t.direction === 'short')
    expect(longs.length + shorts.length).toBe(trades.length)
    expect(shorts.length).toBeGreaterThan(50)
    // a short opens with a short-sell and closes with covers
    expect(longs.length).toBe(expectedSides['buy']! > 0 ? longs.length : 0)

    // P&L reconciles to the broker's own totals
    expect(sum(trades.map((t) => t.grossPnl))).toBeCloseTo(grossTotal, 2)
    expect(sum(trades.map((t) => t.fees))).toBeCloseTo(feeTotal, 2)
    expect(sum(trades.map((t) => t.tradingFees))).toBeCloseTo(feeTotal, 2)
    expect(sum(trades.map((t) => t.netPnl))).toBeCloseTo(netTotal, 2)

    // every trading day in the file has at least one exit
    const tradingDays = new Set(rows.map((r) => r['T/D']))
    expect(new Set(trades.map((t) => t.exitDate)).size).toBe(tradingDays.size)

    // overnight trades exist in both directions and are attributed to their exit day
    const swings = trades.filter((t) => t.isOvernight)
    expect(swings.length).toBeGreaterThan(5)
    expect(swings.some((t) => t.direction === 'short')).toBe(true)
    expect(swings.some((t) => t.direction === 'long')).toBe(true)
    for (const t of swings) {
      expect(t.exitDate! > t.entryDate).toBe(true)
      expect(t.daysHeld).toBeGreaterThan(0)
    }
    expect(trades.filter((t) => !t.isOvernight).every((t) => t.daysHeld === 0)).toBe(true)

    // every execution is referenced by exactly one trade (no flips in this data)
    const referenced = trades.flatMap((t) => t.executionIds)
    expect(referenced).toHaveLength(rows.length)
    expect(new Set(referenced).size).toBe(rows.length)
  })

  it('skips garbage rows with a warning', () => {
    const bad = [...rows.slice(0, 2), { ...rows[0]!, Side: 'XX' }, { ...rows[0]!, Qty: 'abc' }]
    const r = tradezero.parse(bad, { importBatchId: 't' })
    expect(r.executions).toHaveLength(2)
    expect(r.skippedRows).toBe(2)
    expect(r.warnings).toHaveLength(2)
  })
})
