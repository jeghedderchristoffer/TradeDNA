import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'

/** US equity markets. TradeZero (and most US brokers) report times in Eastern. */
export const MARKET_TZ = 'America/New_York'

/** Build an epoch-ms instant from wall-clock components in a timezone. Month is 1-based. */
export function zonedToEpoch(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
  tz = MARKET_TZ,
): number {
  return new TZDate(y, m - 1, d, hh, mm, ss, tz).getTime()
}

/** 'YYYY-MM-DD' of an instant, in the market timezone. */
export function dateKey(epochMs: number, tz = MARKET_TZ): string {
  return format(new TZDate(epochMs, tz), 'yyyy-MM-dd')
}

/** 0-23 hour of an instant in the market timezone. */
export function hourOf(epochMs: number, tz = MARKET_TZ): number {
  return new TZDate(epochMs, tz).getHours()
}

/** 0 (Sunday) .. 6 (Saturday) in the market timezone. */
export function weekdayOf(epochMs: number, tz = MARKET_TZ): number {
  return new TZDate(epochMs, tz).getDay()
}

/** Calendar days between two 'YYYY-MM-DD' keys (b - a). */
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a))
}

/** 'YYYY-MM' of a date key. */
export function monthKey(dateKeyStr: string): string {
  return dateKeyStr.slice(0, 7)
}

/** ISO week key 'YYYY-Www' of a date key. */
export function weekKey(dateKeyStr: string): string {
  return format(parseISO(dateKeyStr), "RRRR-'W'II")
}
