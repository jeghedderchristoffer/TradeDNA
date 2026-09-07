import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { allocateCashEntries, type Allocation } from '@/domain/allocation'
import { DEFAULT_SETTINGS, type ImportBatch, type Settings } from '@/domain/backup'
import type { CashEntry } from '@/domain/cash-entry'
import type { Execution } from '@/domain/execution'
import { matchExecutions, type MatchResult } from '@/domain/matcher'
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

/** Trades are derived, never stored: recomputed whenever executions change. */
export function useMatch(): MatchResult | undefined {
  const executions = useExecutions()
  return useMemo(() => (executions ? matchExecutions(executions) : undefined), [executions])
}

/** Matched trades with cash-journal costs (locates, borrow) attributed. */
export function useAllocation(): (Allocation & { match: MatchResult }) | undefined {
  const match = useMatch()
  const cash = useCashEntries()
  return useMemo(() => {
    if (!match || !cash) return undefined
    return { ...allocateCashEntries(match.trades, cash), match }
  }, [match, cash])
}

export function useSettings(): [
  Settings,
  <K extends keyof Settings>(k: K, v: Settings[K]) => Promise<void>,
] {
  const settings = useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
  return [settings ?? DEFAULT_SETTINGS, setSetting]
}
