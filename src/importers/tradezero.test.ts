import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchExecutions } from '@/domain/matcher'
import { dateKey, hourOf } from '@/lib/dates'
import { parseCsv } from './csv'
import { detectImporter } from './registry'
import { parseEasternDateTime, tradezero } from './tradezero'

// A full year of real (account-scrubbed) trading: 3,330 fills, longs and shorts, overnight holds.
const csv = readFileSync(path.resolve(__dirname, '../test-fixtures/tradezero-trades.csv'), 'utf8')
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('TradeZero trade history importer', () => {
  const parsed = parseCsv(csv)

  it('is auto-detected from the header row', () => {
    expect(parsed.errors).toEqual([])
    expect(detectImporter(parsed.headers)?.id).toBe('tradezero-trades')
    expect(detectImporter(['Date', 'Symbol', 'Amount'])).toBeUndefined()
  })

  it('parses Eastern timestamps (pre-market 04:00 stays 04:00 in market tz)', () => {
    const ts = parseEasternDateTime('08/03/2026', '04:00:20')!
    expect(dateKey(ts)).toBe('2026-08-03')
    expect(hourOf(ts)).toBe(4)
    expect(new Date(ts).toISOString()).toBe('2026-08-03T08:00:20.000Z') // EDT = UTC-4
    // EST in January = UTC-5
    expect(new Date(parseEasternDateTime('01/15/2026', '09:30:00')!).toISOString()).toBe(
      '2026-01-15T14:30:00.000Z',
    )
    expect(parseEasternDateTime('bad', '04:00:20')).toBeNull()
  })

  it('converts every row into a canonical execution with the right totals', () => {
    const { executions, warnings, skippedRows } = tradezero.parse(parsed.rows, {
      importBatchId: 'test',
    })
    expect(skippedRows).toBe(0)
    expect(warnings).toEqual([])
    expect(executions).toHaveLength(3330)

    const sides = executions.reduce<Record<string, number>>((acc, e) => {
      acc[e.side] = (acc[e.side] ?? 0) + 1
      return acc
    }, {})
    expect(sides).toEqual({ buy: 966, sell: 1014, short: 664, cover: 686 })

    expect(sum(executions.map((e) => e.grossProceeds))).toBeCloseTo(2865.53, 2)
    expect(sum(executions.map((e) => e.netProceeds))).toBeCloseTo(40.59, 2)
    expect(sum(executions.map((e) => e.fees))).toBeCloseTo(2824.94, 2)

    const byType: Record<string, number> = {}
    for (const e of executions)
      for (const [k, v] of Object.entries(e.feeBreakdown ?? {})) byType[k] = (byType[k] ?? 0) + v
    expect(sum(Object.values(byType))).toBeCloseTo(2824.94, 2)
    expect(Object.keys(byType).sort()).toEqual(['Comm', 'NSCC', 'Nasdaq', 'SEC', 'TAF'])

    expect(executions[0]).toMatchObject({
      account: 'ACCT0001',
      symbol: 'MOGO',
      side: 'short',
      qty: 200,
      price: 3.45,
      tradeDate: '2025-07-02',
      fees: 1.08,
      currency: 'USD',
      sequence: 0,
    })
  })

  it('produces stable, unique ids so re-imports dedupe', () => {
    const a = tradezero.parse(parsed.rows, { importBatchId: 'first' }).executions
    const b = tradezero.parse(parsed.rows, { importBatchId: 'second' }).executions
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length)
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
  })

  it('matches the whole year into fully explained trades, including overnight holds', () => {
    const { executions } = tradezero.parse(parsed.rows, { importBatchId: 'test' })
    const { trades, unmatched, warnings } = matchExecutions(executions)

    expect(unmatched).toEqual([])
    expect(warnings).toEqual([])
    expect(trades).toHaveLength(1142)
    expect(trades.every((t) => t.status === 'closed')).toBe(true)
    expect(trades.filter((t) => t.isOvernight)).toHaveLength(28)
    expect(trades.filter((t) => t.direction === 'long')).toHaveLength(679)
    expect(trades.filter((t) => t.direction === 'short')).toHaveLength(463)

    // P&L reconciles to the broker's own totals
    expect(sum(trades.map((t) => t.grossPnl))).toBeCloseTo(2865.53, 2)
    expect(sum(trades.map((t) => t.fees))).toBeCloseTo(2824.94, 2)
    expect(sum(trades.map((t) => t.tradingFees))).toBeCloseTo(2824.94, 2)
    expect(sum(trades.map((t) => t.netPnl))).toBeCloseTo(40.59, 2)
    expect(new Set(trades.map((t) => t.exitDate)).size).toBe(235)

    // an overnight trade spans days and is attributed to its exit day
    const swing = trades.find((t) => t.isOvernight)!
    expect(swing.exitDate! > swing.entryDate).toBe(true)
    expect(swing.daysHeld).toBeGreaterThan(0)

    // every execution is referenced by exactly one trade (no flips in this data)
    const referenced = trades.flatMap((t) => t.executionIds)
    expect(referenced).toHaveLength(3330)
    expect(new Set(referenced).size).toBe(3330)
  })

  it('skips garbage rows with a warning', () => {
    const rows = [
      ...parsed.rows.slice(0, 2),
      { ...parsed.rows[0]!, Side: 'XX' },
      { ...parsed.rows[0]!, Qty: 'abc' },
    ]
    const r = tradezero.parse(rows, { importBatchId: 't' })
    expect(r.executions).toHaveLength(2)
    expect(r.skippedRows).toBe(2)
    expect(r.warnings).toHaveLength(2)
  })
})
