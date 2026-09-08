import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { allocateCashEntries, type Allocation } from '@/domain/allocation'
import { DEFAULT_SETTINGS, type ImportBatch, type Settings } from '@/domain/backup'
import type { CashEntry } from '@/domain/cash-entry'
import type { Execution } from '@/domain/execution'
import { matchExecutions, type MatchResult } from '@/domain/matcher'
import { applyNotes, collectTags, type TagCount, type TradeNote } from '@/domain/trade-note'
import { db } from './db'
import { getSettings, setSetting } from './repo'

/** undefined while loading. */
export function useExecutions(): Execution[] | undefined {
  return useLiveQuery(() => db.executions.toArray(), [])
}

export function useCashEntries(): CashEntry[] | undefined {
  return useLiveQuery(() => db.cashEntries.toArray(), [])
}

export function useImportBatches(): ImportBatch[] | undefined {
  return useLiveQuery(() => db.importBatches.orderBy('importedAt').reverse().toArray(), [])
}

export function useTradeNotes(): TradeNote[] | undefined {
  return useLiveQuery(() => db.tradeNotes.toArray(), [])
}

/** Every tag in use with its trade count, most used first. */
export function useTags(): TagCount[] {
  const notes = useTradeNotes()
  return useMemo(() => (notes ? collectTags(notes) : []), [notes])
}

/** Trades are derived, never stored: recomputed whenever executions change. */
export function useMatch(): MatchResult | undefined {
  const executions = useExecutions()
  return useMemo(() => (executions ? matchExecutions(executions) : undefined), [executions])
}

/** Matched trades with cash-journal costs (locates, borrow) attributed and the trader's notes attached. */
export function useAllocation(): (Allocation & { match: MatchResult }) | undefined {
  const match = useMatch()
  const cash = useCashEntries()
  const notes = useTradeNotes()
  return useMemo(() => {
    if (!match || !cash || !notes) return undefined
    const alloc = allocateCashEntries(match.trades, cash)
    return { ...alloc, trades: applyNotes(alloc.trades, notes), match }
  }, [match, cash, notes])
}

export function useSettings(): [
  Settings,
  <K extends keyof Settings>(k: K, v: Settings[K]) => Promise<void>,
] {
  const settings = useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
  return [settings ?? DEFAULT_SETTINGS, setSetting]
}
