import { z } from 'zod'
import { hashId } from '@/lib/utils'

/** Every supported broker. Adding a broker: extend this union + add an importer file. */
export const BROKER_IDS = ['tradezero'] as const
export type BrokerId = (typeof BROKER_IDS)[number]

/**
 * Canonical side. `buy`/`short` open (or add to) a position, `sell`/`cover` close (reduce) one.
 * Brokers that only report buy/sell should still map to these four where the intent is known.
 */
export const SIDES = ['buy', 'sell', 'short', 'cover'] as const
export type Side = (typeof SIDES)[number]

export const ExecutionSchema = z.object({
  /** Deterministic content hash — see makeExecutionId. Primary key. */
  id: z.string().min(8),
  broker: z.enum(BROKER_IDS),
  account: z.string().optional(),
  symbol: z.string().min(1),
  side: z.enum(SIDES),
  /** Always positive. */
  qty: z.number().positive(),
  price: z.number().nonnegative(),
  /** Epoch ms (UTC instant). */
  timestamp: z.number().int(),
  /** 'YYYY-MM-DD' in the market timezone, for calendar grouping. */
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Total fees & commissions for this fill. Positive = cost. Can be negative for net rebates. */
  fees: z.number(),
  /** Per-type breakdown (e.g. Comm, SEC, TAF). Components may be negative (rebates). */
  feeBreakdown: z.record(z.string(), z.number()).optional(),
  /** Signed cash flow before fees, as reported by the broker (negative when buying). */
  grossProceeds: z.number(),
  /** Signed cash flow after fees. */
  netProceeds: z.number(),
  currency: z.string().length(3),
  importBatchId: z.string(),
  /** Row order within the import file — tie-breaker for same-second fills. */
  sequence: z.number().int().nonnegative(),
  /** The original row, kept verbatim for debugging and future re-parsing. */
  raw: z.record(z.string(), z.string()).optional(),
})

export type Execution = z.infer<typeof ExecutionSchema>

/** +qty for buy/cover, -qty for sell/short. */
export function signedQty(e: Pick<Execution, 'side' | 'qty'>): number {
  return e.side === 'buy' || e.side === 'cover' ? e.qty : -e.qty
}

/** Sides that may open a new position. */
export function isOpeningSide(side: Side): boolean {
  return side === 'buy' || side === 'short'
}

export interface ExecutionIdParts {
  broker: BrokerId
  account?: string
  timestamp: number
  symbol: string
  side: Side
  qty: number
  price: number
  grossProceeds: number
  netProceeds: number
  /** 0 for the first row with this exact content in a file, 1 for the second identical row, ... */
  duplicateIndex: number
}

/**
 * Stable id: identical rows across two exports of overlapping periods produce the same id,
 * so re-imports dedupe. Two genuinely identical rows in one file get distinct ids via duplicateIndex.
 */
export function makeExecutionId(p: ExecutionIdParts): string {
  return hashId(
    [
      p.broker,
      p.account ?? '',
      p.timestamp,
      p.symbol,
      p.side,
      p.qty,
      p.price,
      p.grossProceeds,
      p.netProceeds,
      p.duplicateIndex,
    ].join('|'),
  )
}

/** Chronological, deterministic ordering for the matcher. */
export function compareExecutions(a: Execution, b: Execution): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  if (a.importBatchId !== b.importBatchId) return a.importBatchId < b.importBatchId ? -1 : 1
  if (a.sequence !== b.sequence) return a.sequence - b.sequence
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
