import {
  BACKUP_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  SettingsSchema,
  type Backup,
  type ImportBatch,
  type Settings,
} from '@/domain/backup'
import type { CashEntry } from '@/domain/cash-entry'
import type { Execution } from '@/domain/execution'
import { db, type TradeDnaDb } from './db'

export interface CommitResult {
  batch: ImportBatch
  added: number
  duplicates: number
}

/** Split parsed records into new vs already-stored (by deterministic id). */
export async function partitionByExisting(
  executions: Execution[],
  database: TradeDnaDb = db,
): Promise<{ fresh: Execution[]; duplicates: Execution[] }> {
  const existing = await database.executions.bulkGet(executions.map((e) => e.id))
  const fresh: Execution[] = []
  const duplicates: Execution[] = []
  executions.forEach((e, i) => (existing[i] ? duplicates : fresh).push(e))
  return { fresh, duplicates }
}

export async function partitionCashByExisting(
  entries: CashEntry[],
  database: TradeDnaDb = db,
): Promise<{ fresh: CashEntry[]; duplicates: CashEntry[] }> {
  const existing = await database.cashEntries.bulkGet(entries.map((e) => e.id))
  const fresh: CashEntry[] = []
  const duplicates: CashEntry[] = []
  entries.forEach((e, i) => (existing[i] ? duplicates : fresh).push(e))
  return { fresh, duplicates }
}

/** Persist an import: only new records are stored, the batch records both counts. */
export async function commitImport(
  meta: Pick<ImportBatch, 'id' | 'broker' | 'fileName' | 'importerId' | 'kind'>,
  records: { executions?: Execution[]; cashEntries?: CashEntry[] },
  database: TradeDnaDb = db,
): Promise<CommitResult> {
  const tables = [database.executions, database.cashEntries, database.importBatches]
  return database.transaction('rw', tables, async () => {
    const ex = await partitionByExisting(records.executions ?? [], database)
    const cash = await partitionCashByExisting(records.cashEntries ?? [], database)
    const batch: ImportBatch = {
      ...meta,
      importedAt: Date.now(),
      rowCount: (records.executions?.length ?? 0) + (records.cashEntries?.length ?? 0),
      newCount: ex.fresh.length + cash.fresh.length,
      duplicateCount: ex.duplicates.length + cash.duplicates.length,
    }
    if (ex.fresh.length) await database.executions.bulkAdd(ex.fresh)
    if (cash.fresh.length) await database.cashEntries.bulkAdd(cash.fresh)
    await database.importBatches.put(batch)
    return { batch, added: batch.newCount, duplicates: batch.duplicateCount }
  })
}

export async function deleteImportBatch(batchId: string, database: TradeDnaDb = db) {
  await database.transaction(
    'rw',
    [database.executions, database.cashEntries, database.importBatches],
    async () => {
      await database.executions.where('importBatchId').equals(batchId).delete()
      await database.cashEntries.where('importBatchId').equals(batchId).delete()
      await database.importBatches.delete(batchId)
    },
  )
}

export async function clearAllData(database: TradeDnaDb = db) {
  await database.transaction(
    'rw',
    [database.executions, database.cashEntries, database.importBatches, database.settings],
    async () => {
      await database.executions.clear()
      await database.cashEntries.clear()
      await database.importBatches.clear()
      await database.settings.clear()
    },
  )
}

export async function getSettings(database: TradeDnaDb = db): Promise<Settings> {
  const rows = await database.settings.toArray()
  const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...obj })
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
  database: TradeDnaDb = db,
) {
  await database.settings.put({ key, value })
}

export async function buildBackup(database: TradeDnaDb = db): Promise<Backup> {
  const [executions, cashEntries, importBatches, settings] = await Promise.all([
    database.executions.toArray(),
    database.cashEntries.toArray(),
    database.importBatches.toArray(),
    getSettings(database),
  ])
  return {
    app: 'tradedna',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    executions,
    cashEntries,
    importBatches,
    settings,
  }
}

/** Build the backup and hand it to the browser as a download. */
export async function downloadBackup(database: TradeDnaDb = db): Promise<void> {
  const backup = await buildBackup(database)
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tradedna-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type RestoreMode = 'merge' | 'replace'

export interface RestoreResult {
  added: number
  duplicates: number
}

/** Restore a validated backup. `replace` wipes current data first; `merge` dedupes by id. */
export async function restoreBackup(
  backup: Backup,
  mode: RestoreMode,
  database: TradeDnaDb = db,
): Promise<RestoreResult> {
  return database.transaction(
    'rw',
    [database.executions, database.cashEntries, database.importBatches, database.settings],
    async () => {
      if (mode === 'replace') {
        await database.executions.clear()
        await database.cashEntries.clear()
        await database.importBatches.clear()
      }
      const ex = await partitionByExisting(backup.executions, database)
      const cash = await partitionCashByExisting(backup.cashEntries, database)
      if (ex.fresh.length) await database.executions.bulkAdd(ex.fresh)
      if (cash.fresh.length) await database.cashEntries.bulkAdd(cash.fresh)
      await database.importBatches.bulkPut(backup.importBatches)
      for (const [key, value] of Object.entries(backup.settings)) {
        if (value !== undefined) await database.settings.put({ key, value })
      }
      return {
        added: ex.fresh.length + cash.fresh.length,
        duplicates: ex.duplicates.length + cash.duplicates.length,
      }
    },
  )
}
