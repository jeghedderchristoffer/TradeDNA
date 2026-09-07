import { z } from 'zod'
import { hashId } from '@/lib/utils'
import { BROKER_IDS } from './execution'

/**
 * Broad bucket used by the cost analytics.
 * locate/borrow can be attributed to trades (they carry a symbol); the rest is account overhead.
 */
export const CASH_CATEGORIES = ['locate', 'borrow', 'software', 'banking', 'other'] as const
export type CashCategory = (typeof CASH_CATEGORIES)[number]

/** Finer classification straight from the broker note. */
export const CASH_KINDS = [
  'locate',
  'locate-credit',
  'single-use',
  'pre-borrow',
  'overnight-borrow',
  'platform',
  'deposit',
  'withdrawal',
  'bank-fee',
  'unknown',
] as const
export type CashKind = (typeof CASH_KINDS)[number]

export const CashEntrySchema = z.object({
  id: z.string().min(8),
  broker: z.enum(BROKER_IDS),
  account: z.string().optional(),
  /** 'YYYY-MM-DD' effective date. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Signed cash flow: positive = money in (deposit, credit), negative = money out (fee, withdrawal). */
  amount: z.number(),
  category: z.enum(CASH_CATEGORIES),
  kind: z.enum(CASH_KINDS),
  /** Broker's own type label, e.g. "Locate Fees". */
  type: z.string(),
  note: z.string(),
  symbol: z.string().optional(),
  qty: z.number().optional(),
  ratePerShare: z.number().optional(),
  /** For overnight borrow charges: the night being charged for ('YYYY-MM-DD'). */
  forDate: z.string().optional(),
  currency: z.string().length(3),
  importBatchId: z.string(),
  sequence: z.number().int().nonnegative(),
  raw: z.record(z.string(), z.string()).optional(),
})
export type CashEntry = z.infer<typeof CashEntrySchema>

/** Cost as a positive number (credits come out negative). */
export function costOf(e: CashEntry): number {
  return -e.amount
}

/** Entries that carry a symbol can be attributed to trades. */
export function isAttributable(e: CashEntry): boolean {
  return (e.category === 'locate' || e.category === 'borrow') && !!e.symbol
}

export function makeCashEntryId(p: {
  broker: string
  account?: string
  date: string
  amount: number
  type: string
  note: string
  duplicateIndex: number
}): string {
  return hashId(
    ['cash', p.broker, p.account ?? '', p.date, p.amount, p.type, p.note, p.duplicateIndex].join(
      '|',
    ),
  )
}
