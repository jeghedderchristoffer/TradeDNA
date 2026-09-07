import { makeExecutionId, type Execution, type Side } from '@/domain/execution'
import { dateKey, MARKET_TZ, zonedToEpoch } from '@/lib/dates'
import type { BrokerImporter, ParseContext, ParseResult } from './types'

/**
 * TradeZero "Trade History" CSV.
 *
 * Header: Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,
 *         ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note
 * Side:   B = buy, S = sell (close long), SS = short sell, BC = buy to cover
 * Type:   2 = long (margin), 3 = short — redundant with Side, not used
 * Dates:  MM/DD/YYYY, times HH:mm:ss in US/Eastern, no timezone marker
 * Money:  Gross/Net Proceeds are signed (negative for B/BC). fees = Gross − Net.
 */
const REQUIRED = [
  'Account',
  'T/D',
  'Side',
  'Symbol',
  'Qty',
  'Price',
  'Exec Time',
  'Gross Proceeds',
  'Net Proceeds',
]

const FEE_COLUMNS = ['Comm', 'SEC', 'TAF', 'NSCC', 'Nasdaq', 'ECN Remove', 'ECN Add'] as const

const SIDE_MAP: Record<string, Side> = {
  B: 'buy',
  S: 'sell',
  SS: 'short',
  BC: 'cover',
}

export const tradezero: BrokerImporter = {
  id: 'tradezero-trades',
  broker: 'tradezero',
  kind: 'trades',
  name: 'TradeZero Trade History',
  exportHint:
    'ZeroPro → Account → Trade History → choose your date range → Export (CSV). Overlapping exports are fine, duplicates are skipped.',

  detect(headers) {
    const set = new Set(headers.map((h) => h.trim()))
    return REQUIRED.every((h) => set.has(h))
  },

  parse(rows, ctx: ParseContext): ParseResult {
    const executions: Execution[] = []
    const warnings: string[] = []
    let skippedRows = 0
    const seen = new Map<string, number>()
    let feeMismatch = 0

    rows.forEach((row, index) => {
      const line = index + 2 // 1-based, after header
      const get = (k: string) => (row[k] ?? '').trim()

      const symbol = get('Symbol').toUpperCase()
      const sideRaw = get('Side').toUpperCase()
      const side = SIDE_MAP[sideRaw]
      if (!symbol || !side) {
        if (Object.values(row).some((v) => v && v.trim())) {
          warnings.push(`Line ${line}: unknown side "${sideRaw}" or missing symbol — skipped`)
          skippedRows++
        }
        return
      }

      const qty = num(get('Qty'))
      const price = num(get('Price'))
      const gross = num(get('Gross Proceeds'))
      const net = num(get('Net Proceeds'))
      const timestamp = parseEasternDateTime(get('T/D'), get('Exec Time'))
      if (!(qty > 0) || !Number.isFinite(price) || timestamp === null) {
        warnings.push(`Line ${line}: could not parse qty/price/date — skipped`)
        skippedRows++
        return
      }

      const feeBreakdown: Record<string, number> = {}
      let feeSum = 0
      for (const col of FEE_COLUMNS) {
        const v = num(get(col))
        if (v !== 0 && Number.isFinite(v)) {
          feeBreakdown[col] = v
          feeSum += v
        }
      }
      // Broker-authoritative total; breakdown is informational.
      const fees = round4(Number.isFinite(gross) && Number.isFinite(net) ? gross - net : feeSum)
      if (Math.abs(fees - feeSum) > 0.011) feeMismatch++

      const account = get('Account') || undefined
      const grossProceeds = round4(
        Number.isFinite(gross) ? gross : signedProceeds(side, qty, price),
      )
      const netProceeds = round4(Number.isFinite(net) ? net : grossProceeds - fees)

      const idKey = [account, timestamp, symbol, side, qty, price, grossProceeds, netProceeds].join(
        '|',
      )
      const duplicateIndex = seen.get(idKey) ?? 0
      seen.set(idKey, duplicateIndex + 1)

      executions.push({
        id: makeExecutionId({
          broker: 'tradezero',
          account,
          timestamp,
          symbol,
          side,
          qty,
          price,
          grossProceeds,
          netProceeds,
          duplicateIndex,
        }),
        broker: 'tradezero',
        account,
        symbol,
        side,
        qty,
        price,
        timestamp,
        tradeDate: dateKey(timestamp, MARKET_TZ),
        fees,
        feeBreakdown,
        grossProceeds,
        netProceeds,
        currency: (get('Currency') || 'USD').toUpperCase().slice(0, 3),
        importBatchId: ctx.importBatchId,
        sequence: index,
        raw: row,
      })
    })

    if (feeMismatch > 0) {
      warnings.push(
        `${feeMismatch} row(s) where the fee columns do not add up to Gross − Net; the broker total was used`,
      )
    }

    return { executions, cashEntries: [], warnings, skippedRows }
  },
}

/** Strip float noise from broker money columns (e.g. 821.0000000000001). */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

function num(s: string): number {
  if (!s) return NaN
  return Number(s.replace(/[$,]/g, ''))
}

function signedProceeds(side: Side, qty: number, price: number): number {
  return side === 'buy' || side === 'cover' ? -qty * price : qty * price
}

/** "MM/DD/YYYY" + "HH:mm[:ss[.SSS]]" in US/Eastern → epoch ms. */
export function parseEasternDateTime(date: string, time: string): number | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date)
  if (!d) return null
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time || '00:00:00')
  if (!t) return null
  return zonedToEpoch(
    Number(d[3]),
    Number(d[1]),
    Number(d[2]),
    Number(t[1]),
    Number(t[2]),
    Number(t[3] ?? 0),
    MARKET_TZ,
  )
}
