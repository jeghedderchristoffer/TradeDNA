import { hourOf, MARKET_TZ } from '@/lib/dates'
import { TZDate } from '@date-fns/tz'
import { attributionDate, pnlOf, type PnlBasis, type Trade } from '../trade'
import { groupTrades, type Bucket } from './buckets'
import { closedOnly } from './filter'
import { mean, median, sum } from './summary'

/* ------------------------------------------------------------------ */
/* Risk & sizing                                                       */
/* ------------------------------------------------------------------ */

export interface RiskStats {
  /** 1R = average losing trade (absolute). 0 when there are no losers. */
  rUnit: number
  avgWinR: number
  expectancyR: number
  largestLossR: number
  largestWinR: number
  /** avg win / |avg loss| */
  payoffRatio: number
  /** Share of gross winnings produced by the 5 largest winners (0..1). */
  top5WinnersShare: number
  /** Share of gross losses produced by the 5 largest losers (0..1). */
  top5LosersShare: number
  /** Net P&L if the 5 largest losers had been cut at 1R. */
  pnlIfLossesCappedAt1R: number
  /** Losers bigger than 2R. */
  outsizedLosses: number
  avgPositionValue: number
  medianPositionValue: number
  maxPositionValue: number
}

export function computeRisk(trades: Trade[], basis: PnlBasis): RiskStats {
  const closed = closedOnly(trades)
  const pnls = closed.map((t) => pnlOf(t, basis))
  const wins = pnls.filter((p) => p > 0).sort((a, b) => b - a)
  const losses = pnls.filter((p) => p < 0).sort((a, b) => a - b)
  const rUnit = losses.length ? Math.abs(mean(losses)) : 0
  const r = (x: number) => (rUnit > 0 ? x / rUnit : 0)
  const winSum = sum(wins)
  const lossSum = Math.abs(sum(losses))
  const values = closed.map((t) => t.avgEntry * t.qty)
  const capped = pnls.map((p) => (p < -rUnit ? -rUnit : p))
  return {
    rUnit,
    avgWinR: r(wins.length ? mean(wins) : 0),
    expectancyR: r(closed.length ? mean(pnls) : 0),
    largestLossR: r(losses[0] ?? 0),
    largestWinR: r(wins[0] ?? 0),
    payoffRatio: losses.length && wins.length ? mean(wins) / Math.abs(mean(losses)) : 0,
    top5WinnersShare: winSum > 0 ? sum(wins.slice(0, 5)) / winSum : 0,
    top5LosersShare: lossSum > 0 ? Math.abs(sum(losses.slice(0, 5))) / lossSum : 0,
    pnlIfLossesCappedAt1R: sum(capped),
    outsizedLosses: losses.filter((l) => l < -2 * rUnit).length,
    avgPositionValue: mean(values),
    medianPositionValue: median(values),
    maxPositionValue: values.length ? Math.max(...values) : 0,
  }
}

export interface HistogramBin {
  key: string
  label: string
  from: number
  to: number
  count: number
  /** Sum of P&L in the bin (sign tells the color). */
  pnl: number
}

/** P&L distribution in ~12 equal-width bins with a "nice" width. Zero is always a bin edge. */
export function pnlHistogram(trades: Trade[], basis: PnlBasis, targetBins = 12): HistogramBin[] {
  const pnls = closedOnly(trades).map((t) => pnlOf(t, basis))
  if (!pnls.length) return []
  const min = Math.min(...pnls)
  const max = Math.max(...pnls)
  const span = Math.max(max - min, 1)
  const width = niceStep(span / targetBins)
  const lo = Math.floor(min / width) * width
  const hi = Math.ceil((max + 1e-9) / width) * width
  const bins: HistogramBin[] = []
  for (let from = lo; from < hi; from += width) {
    const to = from + width
    bins.push({
      key: String(from),
      label: `${fmtEdge(from)} … ${fmtEdge(to)}`,
      from,
      to,
      count: 0,
      pnl: 0,
    })
  }
  for (const p of pnls) {
    let i = Math.floor((p - lo) / width)
    if (i >= bins.length) i = bins.length - 1
    const b = bins[i]!
    b.count++
    b.pnl += p
  }
  return bins
}

function niceStep(raw: number): number {
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * mag
}

function fmtEdge(n: number): string {
  const abs = Math.abs(n)
  const s = abs >= 1000 ? `${(abs / 1000).toFixed(abs % 1000 ? 1 : 0)}k` : String(Math.round(abs))
  return n < 0 ? `-${s}` : s
}

/* ------------------------------------------------------------------ */
/* Where the edge is: price and size bands                             */
/* ------------------------------------------------------------------ */

const PRICE_BANDS: [number, string][] = [
  [1, '< $1'],
  [2, '$1–2'],
  [5, '$2–5'],
  [10, '$5–10'],
  [20, '$10–20'],
  [Infinity, '$20+'],
]
const SHARE_BANDS: [number, string][] = [
  [100, '≤ 100 sh'],
  [300, '101–300'],
  [500, '301–500'],
  [1000, '501–1,000'],
  [Infinity, '1,000+'],
]
const VALUE_BANDS: [number, string][] = [
  [500, '< $500'],
  [1000, '$500–1k'],
  [2500, '$1k–2.5k'],
  [5000, '$2.5k–5k'],
  [10000, '$5k–10k'],
  [Infinity, '$10k+'],
]

function band(value: number, bands: [number, string][]): string {
  const i = bands.findIndex(([max]) => value <= max)
  const idx = i === -1 ? bands.length - 1 : i
  return `${idx}|${bands[idx]![1]}`
}
const bandLabel = (k: string) => k.slice(k.indexOf('|') + 1)

/** By average entry price. */
export function byPriceBand(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, (t) => band(t.avgEntry, PRICE_BANDS), basis, bandLabel)
}
/** By largest position size in shares. */
export function byShareBand(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, (t) => band(t.qty, SHARE_BANDS), basis, bandLabel)
}
/** By dollar value of the position (avg entry × shares). */
export function byValueBand(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(trades, (t) => band(t.avgEntry * t.qty, VALUE_BANDS), basis, bandLabel)
}

/* ------------------------------------------------------------------ */
/* Intraday                                                            */
/* ------------------------------------------------------------------ */

export interface IntradayPoint {
  /** Minutes since midnight, market time. */
  minute: number
  label: string
  /** Average cumulative P&L per trading day at this time. */
  avgCum: number
  /** Total P&L realized in this slot across all days. */
  slotPnl: number
  trades: number
}

/** Average cumulative P&L through the day (by exit time), in `stepMin` slots from 04:00 to 20:00. */
export function intradayCurve(trades: Trade[], basis: PnlBasis, stepMin = 30): IntradayPoint[] {
  const closed = closedOnly(trades)
  const days = new Set(closed.map(attributionDate)).size
  const start = 4 * 60
  const end = 20 * 60
  const slots: IntradayPoint[] = []
  for (let m = start; m <= end; m += stepMin) {
    slots.push({
      minute: m,
      label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
      avgCum: 0,
      slotPnl: 0,
      trades: 0,
    })
  }
  if (!days) return slots
  for (const t of closed) {
    const d = new TZDate(t.exitTime!, MARKET_TZ)
    const m = d.getHours() * 60 + d.getMinutes()
    let i = Math.ceil((m - start) / stepMin)
    i = Math.max(0, Math.min(slots.length - 1, i))
    slots[i]!.slotPnl += pnlOf(t, basis)
    slots[i]!.trades++
  }
  let cum = 0
  for (const s of slots) {
    cum += s.slotPnl
    s.avgCum = cum / days
  }
  return slots
}

export interface StopTimeRow {
  /** 'HH:mm' market time. */
  cutoff: string
  /** P&L keeping only trades ENTERED before the cutoff. */
  pnl: number
  /** pnl − actual */
  delta: number
  tradesRemoved: number
  winRate: number
}

/** "What if I stopped opening trades at …" for a set of cutoffs. */
export function stopTradingAt(
  trades: Trade[],
  basis: PnlBasis,
  cutoffs = ['10:00', '10:30', '11:00', '12:00', '13:00', '14:00', '15:00'],
): StopTimeRow[] {
  const closed = closedOnly(trades)
  const actual = sum(closed.map((t) => pnlOf(t, basis)))
  const minuteOf = (t: Trade) => {
    const d = new TZDate(t.entryTime, MARKET_TZ)
    return d.getHours() * 60 + d.getMinutes()
  }
  return cutoffs.map((c) => {
    const [h, m] = c.split(':').map(Number) as [number, number]
    const cut = h * 60 + m
    const kept = closed.filter((t) => minuteOf(t) < cut)
    const pnl = sum(kept.map((t) => pnlOf(t, basis)))
    const wins = kept.filter((t) => pnlOf(t, basis) > 0).length
    return {
      cutoff: c,
      pnl,
      delta: pnl - actual,
      tradesRemoved: closed.length - kept.length,
      winRate: kept.length ? wins / kept.length : 0,
    }
  })
}

/** Convenience: first-hour vs rest of day, by entry hour. */
export function firstHourVsRest(trades: Trade[], basis: PnlBasis): Bucket[] {
  return groupTrades(
    trades,
    (t) => {
      const h = hourOf(t.entryTime)
      return h < 9 || (h === 9 && new TZDate(t.entryTime, MARKET_TZ).getMinutes() < 30)
        ? '0|Pre-market'
        : h < 10 || (h === 10 && new TZDate(t.entryTime, MARKET_TZ).getMinutes() < 30)
          ? '1|Open – 10:30'
          : h < 12
            ? '2|10:30 – 12:00'
            : h < 15
              ? '3|12:00 – 15:00'
              : h < 16
                ? '4|Power hour'
                : '5|After hours'
    },
    basis,
    bandLabel,
  )
}

/* ------------------------------------------------------------------ */
/* Consistency                                                         */
/* ------------------------------------------------------------------ */

export interface ConsistencyStats {
  tradingDays: number
  greenDays: number
  redDays: number
  greenDayRate: number
  avgGreenDay: number
  avgRedDay: number
  medianDay: number
  /** Standard deviation of daily P&L. */
  dailyStdDev: number
  bestDay: number
  worstDay: number
  /** Total P&L without the single best day. */
  pnlWithoutBestDay: number
  /** Total P&L without the single worst day. */
  pnlWithoutWorstDay: number
  /** Best day as a share of total |P&L| (0..1). >0.5 means one day carried the period. */
  bestDayShare: number
  greenWeeks: number
  weeks: number
  /** Longest run of consecutive green / red days. */
  maxGreenStreak: number
  maxRedStreak: number
}

export function computeConsistency(dayBuckets: Bucket[], weekBuckets: Bucket[]): ConsistencyStats {
  const daily = dayBuckets.map((d) => d.pnl)
  const total = sum(daily)
  const green = daily.filter((p) => p > 0)
  const red = daily.filter((p) => p < 0)
  const best = daily.length ? Math.max(...daily) : 0
  const worst = daily.length ? Math.min(...daily) : 0
  const avg = mean(daily)
  const sd =
    daily.length > 1 ? Math.sqrt(sum(daily.map((p) => (p - avg) ** 2)) / (daily.length - 1)) : 0
  let g = 0
  let r = 0
  let maxG = 0
  let maxR = 0
  for (const p of daily) {
    if (p > 0) {
      g++
      r = 0
    } else if (p < 0) {
      r++
      g = 0
    } else {
      g = 0
      r = 0
    }
    maxG = Math.max(maxG, g)
    maxR = Math.max(maxR, r)
  }
  const absTotal = sum(daily.map(Math.abs))
  return {
    tradingDays: daily.length,
    greenDays: green.length,
    redDays: red.length,
    greenDayRate: daily.length ? green.length / daily.length : 0,
    avgGreenDay: mean(green),
    avgRedDay: mean(red),
    medianDay: median(daily),
    dailyStdDev: sd,
    bestDay: best,
    worstDay: worst,
    pnlWithoutBestDay: total - best,
    pnlWithoutWorstDay: total - worst,
    bestDayShare: absTotal > 0 ? Math.max(0, best) / absTotal : 0,
    greenWeeks: weekBuckets.filter((w) => w.pnl > 0).length,
    weeks: weekBuckets.length,
    maxGreenStreak: maxG,
    maxRedStreak: maxR,
  }
}
