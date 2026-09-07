import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseBackup } from '@/domain/backup'
import { parseCsv } from '@/importers/csv'
import { tradezero } from '@/importers/tradezero'
import { tradezeroCash } from '@/importers/tradezero-cash'
import { TradeDnaDb } from './db'
import {
  buildBackup,
  clearAllData,
  commitImport,
  deleteImportBatch,
  getSettings,
  partitionByExisting,
  restoreBackup,
  setSetting,
} from './repo'

const rows = parseCsv(
  readFileSync(path.resolve(__dirname, '../test-fixtures/tradezero-trades.csv'), 'utf8'),
).rows.slice(0, 500)
const cashRows = parseCsv(
  readFileSync(path.resolve(__dirname, '../test-fixtures/tradezero-cash.csv'), 'utf8'),
).rows.slice(0, 100)

const meta = (id: string, kind: 'trades' | 'cash' = 'trades') => ({
  id,
  broker: 'tradezero' as const,
  importerId: kind === 'trades' ? 'tradezero-trades' : 'tradezero-cash',
  kind,
  fileName: `${id}.csv`,
})

let db: TradeDnaDb
let n = 0
beforeEach(() => {
  db = new TradeDnaDb(`test-${++n}`)
})

describe('storage repo', () => {
  it('stores an import and skips duplicates on re-import', async () => {
    const first = tradezero.parse(rows, { importBatchId: 'b1' }).executions
    const r1 = await commitImport(meta('b1'), { executions: first }, db)
    expect(r1.added).toBe(500)
    expect(r1.duplicates).toBe(0)

    // overlapping subset of the same file
    const second = tradezero.parse(rows.slice(100, 300), { importBatchId: 'b2' }).executions
    const { fresh, duplicates } = await partitionByExisting(second, db)
    expect(fresh).toHaveLength(0)
    expect(duplicates).toHaveLength(200)
    const r2 = await commitImport(meta('b2'), { executions: second }, db)
    expect(r2.added).toBe(0)
    expect(r2.duplicates).toBe(200)
    expect(await db.executions.count()).toBe(500)
    expect(await db.importBatches.count()).toBe(2)
  })

  it('stores cash entries with their own dedupe', async () => {
    const cash = tradezeroCash.parse(cashRows, { importBatchId: 'c1' }).cashEntries
    const r1 = await commitImport(meta('c1', 'cash'), { cashEntries: cash }, db)
    expect(r1.added).toBe(100)
    const r2 = await commitImport(meta('c2', 'cash'), { cashEntries: cash }, db)
    expect(r2.added).toBe(0)
    expect(r2.duplicates).toBe(100)
    expect(await db.cashEntries.count()).toBe(100)
    expect((await db.importBatches.get('c1'))?.kind).toBe('cash')
  })

  it('deletes only the records of one batch', async () => {
    const a = tradezero.parse(rows.slice(0, 10), { importBatchId: 'b1' }).executions
    const b = tradezero.parse(rows.slice(10, 30), { importBatchId: 'b2' }).executions
    const c = tradezeroCash.parse(cashRows.slice(0, 7), { importBatchId: 'c1' }).cashEntries
    await commitImport(meta('b1'), { executions: a }, db)
    await commitImport(meta('b2'), { executions: b }, db)
    await commitImport(meta('c1', 'cash'), { cashEntries: c }, db)
    await deleteImportBatch('b1', db)
    expect(await db.executions.count()).toBe(20)
    expect(await db.cashEntries.count()).toBe(7)
    await deleteImportBatch('c1', db)
    expect(await db.cashEntries.count()).toBe(0)
    expect((await db.importBatches.toArray()).map((x) => x.id)).toEqual(['b2'])
  })

  it('round-trips a backup through JSON, with merge and replace', async () => {
    const all = tradezero.parse(rows, { importBatchId: 'b1' }).executions
    const cash = tradezeroCash.parse(cashRows, { importBatchId: 'c1' }).cashEntries
    await commitImport(meta('b1'), { executions: all }, db)
    await commitImport(meta('c1', 'cash'), { cashEntries: cash }, db)
    await setSetting('pnlBasis', 'gross', db)

    const text = JSON.stringify(await buildBackup(db))
    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.schemaVersion).toBe(2)
    expect(parsed.backup.executions).toHaveLength(500)
    expect(parsed.backup.cashEntries).toHaveLength(100)
    expect(parsed.backup.settings.pnlBasis).toBe('gross')

    const db2 = new TradeDnaDb('test-restore-merge')
    const r = await restoreBackup(parsed.backup, 'merge', db2)
    expect(r.added).toBe(600)
    expect((await getSettings(db2)).pnlBasis).toBe('gross')

    const r2 = await restoreBackup(parsed.backup, 'merge', db2)
    expect(r2.added).toBe(0)
    expect(r2.duplicates).toBe(600)

    const db3 = new TradeDnaDb('test-restore-replace')
    const other = tradezero
      .parse(rows.slice(0, 5), { importBatchId: 'zz' })
      .executions.map((e) => ({ ...e, id: `other-${e.id}` }))
    await commitImport(meta('zz'), { executions: other }, db3)
    await restoreBackup(parsed.backup, 'replace', db3)
    expect(await db3.executions.count()).toBe(500)
    expect(await db3.executions.get(`other-${all[0]!.id}`)).toBeUndefined()
  })

  it('accepts a v1 backup without cash entries', () => {
    const v1 = {
      app: 'tradedna',
      schemaVersion: 1,
      exportedAt: 'x',
      executions: [],
      importBatches: [
        {
          id: 'a',
          broker: 'tradezero',
          fileName: 'f',
          importedAt: 1,
          rowCount: 0,
          newCount: 0,
          duplicateCount: 0,
        },
      ],
    }
    const r = parseBackup(JSON.stringify(v1))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.backup.cashEntries).toEqual([])
      expect(r.backup.importBatches[0]!.kind).toBe('trades')
    }
  })

  it('rejects files that are not backups', () => {
    expect(parseBackup('not json').ok).toBe(false)
    expect(parseBackup('{"app":"other"}').ok).toBe(false)
    const future = parseBackup(
      '{"app":"tradedna","schemaVersion":99,"exportedAt":"x","executions":[]}',
    )
    expect(future.ok).toBe(false)
    if (!future.ok) expect(future.error).toMatch(/newer/)
  })

  it('clears everything', async () => {
    const a = tradezero.parse(rows.slice(0, 10), { importBatchId: 'b1' }).executions
    await commitImport(meta('b1'), { executions: a }, db)
    await setSetting('theme', 'dark', db)
    await clearAllData(db)
    expect(await db.executions.count()).toBe(0)
    expect(await db.cashEntries.count()).toBe(0)
    expect(await db.importBatches.count()).toBe(0)
    expect((await getSettings(db)).theme).toBe('system')
  })
})
