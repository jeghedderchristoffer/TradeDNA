import { useMemo } from 'react'
import type { CashEntry } from '@/domain/cash-entry'
import type { UnmatchedExecution } from '@/domain/matcher'
import { filterCashEntries, filterTrades, type TradeFilter } from '@/domain/metrics'
import type { PnlBasis, Trade } from '@/domain/trade'
import { useAllocation, useSettings } from '@/storage/hooks'
import type { DirectionFilter } from '@/domain/backup'
import { resolveRange, useRange } from './range-store'

export interface Journal {
  loading: boolean
  basis: PnlBasis
  /** Every trade, unfiltered, with locate/borrow costs attributed. */
  allTrades: Trade[]
  /** Trades within the global date range (+ extra filter). */
  trades: Trade[]
  /** Cash entries in range that are NOT attributed to a trade: unused locates + account overhead. */
  cashEntries: CashEntry[]
  /** Symbol-bearing entries that matched no trade (mostly unused locates), in range. */
  unallocated: CashEntry[]
  /** Symbol-less entries (software, banking), in range. */
  overhead: CashEntry[]
  hasCashData: boolean
  unmatched: UnmatchedExecution[]
  warnings: string[]
  range: Pick<TradeFilter, 'from' | 'to'>
  /** Global navbar direction filter. */
  direction: DirectionFilter
}

/** The one place pages get their data: trades and costs, scoped by the global range, in the chosen basis. */
export function useJournal(extra?: Omit<TradeFilter, 'from' | 'to'>): Journal {
  const alloc = useAllocation()
  const [settings] = useSettings()
  const [rangeState] = useRange()
  const direction = settings.direction
  const range = useMemo(() => resolveRange(rangeState), [rangeState])
  const allTrades = alloc?.trades ?? EMPTY_T
  const extraKey = JSON.stringify(extra ?? {})
  const trades = useMemo(() => {
    const parsed = JSON.parse(extraKey) as Omit<TradeFilter, 'from' | 'to'>
    const dir = direction === 'all' ? undefined : direction
    return filterTrades(allTrades, { direction: dir, ...range, ...parsed })
  }, [allTrades, range, extraKey, direction])
  const unallocated = useMemo(
    () => filterCashEntries(alloc?.unallocated ?? EMPTY_C, range),
    [alloc, range],
  )
  const overhead = useMemo(
    () => filterCashEntries(alloc?.overhead ?? EMPTY_C, range),
    [alloc, range],
  )
  const cashEntries = useMemo(() => [...unallocated, ...overhead], [unallocated, overhead])

  return {
    loading: alloc === undefined,
    basis: settings.pnlBasis,
    allTrades,
    trades,
    cashEntries,
    unallocated,
    overhead,
    hasCashData:
      (alloc?.unallocated.length ?? 0) +
        (alloc?.overhead.length ?? 0) +
        (alloc?.allocatedCount ?? 0) >
      0,
    unmatched: alloc?.match.unmatched ?? EMPTY_U,
    warnings: alloc?.match.warnings ?? EMPTY_W,
    range,
    direction,
  }
}

const EMPTY_T: Trade[] = []
const EMPTY_C: CashEntry[] = []
const EMPTY_U: UnmatchedExecution[] = []
const EMPTY_W: string[] = []
