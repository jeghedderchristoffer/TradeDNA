import Dexie, { type EntityTable } from 'dexie'
import type { ImportBatch } from '@/domain/backup'
import type { CashEntry } from '@/domain/cash-entry'
import type { Execution } from '@/domain/execution'
import type { TradeNote } from '@/domain/trade-note'

export interface SettingRow {
  key: string
  value: unknown
}

/**
 * All persistence is IndexedDB in the user's browser. Nothing is sent anywhere.
 * Executions and cash entries are the source of truth; trades are recomputed from them on load.
 * Trade notes (tags + text) are the trader's own input, keyed by the deterministic trade id.
 */
export class TradeDnaDb extends Dexie {
  executions!: EntityTable<Execution, 'id'>
  cashEntries!: EntityTable<CashEntry, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  tradeNotes!: EntityTable<TradeNote, 'tradeId'>
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
    this.version(3).stores({
      executions: 'id, symbol, timestamp, tradeDate, importBatchId',
      cashEntries: 'id, symbol, date, category, importBatchId',
      importBatches: 'id, importedAt',
      tradeNotes: 'tradeId, updatedAt',
      settings: 'key',
    })
  }
}

export const db = new TradeDnaDb()
