import { useSyncExternalStore } from 'react'
import { format, startOfMonth, startOfYear, subDays } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { MARKET_TZ } from '@/lib/dates'
import type { TradeFilter } from '@/domain/metrics'

export type RangePreset = 'all' | '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'custom'

export interface RangeState {
  preset: RangePreset
  from?: string
  to?: string
}

export const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'mtd', label: 'This month' },
  { value: 'ytd', label: 'This year' },
]

/** Tiny global store so every page scopes to the same range. */
let state: RangeState = { preset: 'all' }
const listeners = new Set<() => void>()

export function setRange(next: RangeState) {
  state = next
  listeners.forEach((l) => l())
}

export function useRange(): [RangeState, (s: RangeState) => void] {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
  return [s, setRange]
}

/** Resolve a preset to inclusive date-key bounds, relative to today in market time. */
export function resolveRange(s: RangeState, now = Date.now()): Pick<TradeFilter, 'from' | 'to'> {
  const today = new TZDate(now, MARKET_TZ)
  const key = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (s.preset) {
    case 'all':
      return {}
    case '7d':
      return { from: key(subDays(today, 6)) }
    case '30d':
      return { from: key(subDays(today, 29)) }
    case '90d':
      return { from: key(subDays(today, 89)) }
    case 'mtd':
      return { from: key(startOfMonth(today)) }
    case 'ytd':
      return { from: key(startOfYear(today)) }
    case 'custom':
      return { from: s.from, to: s.to }
  }
}
