import { TZDate } from '@date-fns/tz'
import { format, parseISO } from 'date-fns'
import { MARKET_TZ } from './dates'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function fmtMoney(n: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '—'
  const abs = Math.abs(n)
  const body = opts.compact && abs >= 10_000 ? usdCompact.format(abs) : usd.format(abs)
  if (n < 0) return `-${body}`
  return opts.sign && n > 0 ? `+${body}` : body
}

export function fmtNumber(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** 0.5123 → "51.2%" */
export function fmtPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

export function fmtRatio(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '—'
  return n.toFixed(digits)
}

export function fmtDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

/** '2026-08-03' → 'Aug 3, 2026' */
export function fmtDateKey(key: string, pattern = 'MMM d, yyyy'): string {
  return format(parseISO(key), pattern)
}

/** '2026-08' → 'August 2026' */
export function fmtMonthKey(key: string): string {
  return format(parseISO(`${key}-01`), 'MMMM yyyy')
}

export function fmtTime(epochMs: number, pattern = 'HH:mm:ss'): string {
  return format(new TZDate(epochMs, MARKET_TZ), pattern)
}

export function fmtDateTime(epochMs: number): string {
  return format(new TZDate(epochMs, MARKET_TZ), 'MMM d, yyyy HH:mm:ss')
}

export function pnlClass(n: number): string {
  if (n > 0) return 'text-profit'
  if (n < 0) return 'text-loss'
  return 'text-muted-foreground'
}
