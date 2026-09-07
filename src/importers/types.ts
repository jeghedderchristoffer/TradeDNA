import type { CashEntry } from '@/domain/cash-entry'
import type { BrokerId, Execution } from '@/domain/execution'

export interface ParseContext {
  importBatchId: string
}

export type ImportKind = 'trades' | 'cash'

export interface ParseResult {
  executions: Execution[]
  cashEntries: CashEntry[]
  /** Human-readable, non-fatal problems (unknown side, unparsable row, fee mismatch...). */
  warnings: string[]
  skippedRows: number
}

/**
 * One importer per broker export type. Adding a broker = one new file implementing this
 * and registering it. Importers must be pure: rows in, canonical objects out.
 */
export interface BrokerImporter {
  /** Unique, stable, e.g. 'tradezero-trades'. Stored on import batches. */
  id: string
  broker: BrokerId
  kind: ImportKind
  name: string
  /** Short guidance shown in the UI: where to find the export in the broker's platform. */
  exportHint: string
  /** Return true when the CSV header row looks like this export. */
  detect(headers: string[]): boolean
  parse(rows: Record<string, string>[], ctx: ParseContext): ParseResult
}
