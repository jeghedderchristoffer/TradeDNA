import { z } from 'zod'
import { CashEntrySchema } from './cash-entry'
import { BROKER_IDS, ExecutionSchema } from './execution'
import { TradeNoteSchema } from './trade-note'

export const ImportBatchSchema = z.object({
  id: z.string(),
  broker: z.enum(BROKER_IDS),
  /** Importer id, e.g. 'tradezero-trades'. Older batches fall back to the broker id. */
  importerId: z.string().optional(),
  kind: z.enum(['trades', 'cash']).default('trades'),
  fileName: z.string(),
  importedAt: z.number().int(),
  rowCount: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
})
export type ImportBatch = z.infer<typeof ImportBatchSchema>

export const SettingsSchema = z.object({
  pnlBasis: z.enum(['gross', 'net']).default('net'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  /** Global Long / Short filter applied to every page. */
  direction: z.enum(['all', 'long', 'short']).default('all'),
})
export type Settings = z.infer<typeof SettingsSchema>
export type DirectionFilter = Settings['direction']
export const DEFAULT_SETTINGS: Settings = { pnlBasis: 'net', theme: 'system', direction: 'all' }

/** v1: executions only. v2: + cashEntries, importBatches.kind. v3: + tradeNotes. */
export const BACKUP_SCHEMA_VERSION = 3

/**
 * The portable backup file. Everything the app knows is derivable from executions, cash entries
 * and the trader's own notes, so this is the only thing a user ever needs to keep.
 */
export const BackupSchema = z.object({
  app: z.literal('tradedna'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  executions: z.array(ExecutionSchema),
  cashEntries: z.array(CashEntrySchema).default([]),
  importBatches: z.array(ImportBatchSchema).default([]),
  tradeNotes: z.array(TradeNoteSchema).default([]),
  settings: SettingsSchema.partial().default({}),
})
export type Backup = z.infer<typeof BackupSchema>

export type BackupParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

/** Parse + validate a backup file. Older schema versions are upgraded by the schema defaults. */
export function parseBackup(text: string): BackupParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not a valid JSON file.' }
  }
  const version = (json as { schemaVersion?: unknown })?.schemaVersion
  if (typeof version === 'number' && version > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This backup was created by a newer TradeDNA (schema v${version}). Please update the app.`,
    }
  }
  const result = BackupSchema.safeParse(json)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      ok: false,
      error: `Not a TradeDNA backup: ${first ? `${first.path.join('.')} ${first.message}` : 'invalid shape'}`,
    }
  }
  return { ok: true, backup: result.data }
}
