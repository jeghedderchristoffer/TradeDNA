import Dexie, { type EntityTable } from 'dexie'
import type { ImportBatch } from '@/domain/backup'
import type { CashEntry } from '@/domain/cash-entry'
import type { Execution } from '@/domain/execution'

export interface SettingRow {
  key: string
  value: unknown
}

/**
 * All persistence is IndexedDB in the user's browser. Nothing is sent anywhere.
 * Executions and cash entries are the source of truth; trades are recomputed from them on load.
 */
export class TradeDnaDb extends Dexie {
  executions!: EntityTable<Execution, 'id'>
  cashEntries!: EntityTable<CashEntry, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  settings!: EntityTable<SettingRow, 'key'>

  constructor(name = 'tradedna') {
    super(name)
    this.version(1).stores({
      executions: 'id, symbol, timestamp, tradeDate, importBatchId',
      importBatches: 'id, importedAt',
      settings: 'key',
    })
    this.version(2).stores({
      executions: 'id, symbol, timestamp, tradeDate, importBatchId',
      cashEntries: 'id, symbol, date, category, importBatchId',
      importBatches: 'id, importedAt',
      settings: 'key',
    })
  }
}

export const db = new TradeDnaDb()
