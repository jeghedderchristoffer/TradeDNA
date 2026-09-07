import {
  makeCashEntryId,
  type CashCategory,
  type CashEntry,
  type CashKind,
} from '@/domain/cash-entry'
import type { BrokerImporter, ParseContext, ParseResult } from './types'

/**
 * TradeZero "Cash Journal" CSV.
 *
 * Header: Account,Name,Currency,E/D,Deposit,Withdraw,Type,Note,Product
 * Type:   "Locate Fees" | "Locate & Borrow Charge" | "Software & Data" | "Banking" | ...
 * Notes:  "Locate 400 MOGO @ 0.02 per share"
 *         "Locate credit 100 MOGO @ 0.006 per share"        (refund, appears in Deposit)
 *         "Single-Use 500 AZI @ 0.01 per share"
 *         "Pre-Borrow 100 XYZ @ 0.05 per share"
 *         "62% Locate CreditLocate 100 INOD @ 0.0045 per share" (partial refund)
 *         "ONB 60 PPSI ($0.00417) for 08/15"                (overnight borrow for that night)
 *         "ZeroPro"                                          (platform subscription)
 *         "Wire In" / "Wire In Fee"
 */
const REQUIRED = ['Account', 'E/D', 'Deposit', 'Withdraw', 'Type', 'Note']

const LOCATE_RE = /(\d+(?:\.\d+)?)\s+([A-Z][A-Z0-9.-]*)\s+@\s+\$?(\d+(?:\.\d+)?)\s+per\s+share/i
// "ONB 60 PPSI ($0.00417) for 08/15" — rate may be negative (rebate), "REV:" prefix marks a reversal
const ONB_RE =
  /^(?:REV:\s*)?ONB\s+(\d+(?:\.\d+)?)\s+([A-Z][A-Z0-9.-]*)\s+\(\$?(-?\d+(?:\.\d+)?)\)\s+for\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i

export const tradezeroCash: BrokerImporter = {
  id: 'tradezero-cash',
  broker: 'tradezero',
  kind: 'cash',
  name: 'TradeZero Cash Journal',
  exportHint:
    'ZeroPro → Account → Cash Journal → choose your date range → Export (CSV). Adds locate fees, borrow charges, software and banking costs.',

  detect(headers) {
    const set = new Set(headers.map((h) => h.trim()))
    return REQUIRED.every((h) => set.has(h)) && !set.has('Exec Time')
  },

  parse(rows, ctx: ParseContext): ParseResult {
    const cashEntries: CashEntry[] = []
    const warnings: string[] = []
    let skippedRows = 0
    const seen = new Map<string, number>()
    let unknown = 0

    rows.forEach((row, index) => {
      const line = index + 2
      const get = (k: string) => (row[k] ?? '').trim()
      const type = get('Type')
      const note = get('Note')
      const date = parseDate(get('E/D'))
      const deposit = num(get('Deposit'))
      const withdraw = num(get('Withdraw'))
      if (!date || (!Number.isFinite(deposit) && !Number.isFinite(withdraw))) {
        if (Object.values(row).some((v) => v && v.trim())) {
          warnings.push(`Line ${line}: could not parse date/amount — skipped`)
          skippedRows++
        }
        return
      }
      const amount = round4(
        (Number.isFinite(deposit) ? deposit : 0) - (Number.isFinite(withdraw) ? withdraw : 0),
      )
      const cls = classify(type, note, amount, date)
      if (cls.kind === 'unknown') unknown++

      const account = get('Account') || undefined
      const idKey = [account, date, amount, type, note].join('|')
      const duplicateIndex = seen.get(idKey) ?? 0
      seen.set(idKey, duplicateIndex + 1)

      cashEntries.push({
        id: makeCashEntryId({
          broker: 'tradezero',
          account,
          date,
          amount,
          type,
          note,
          duplicateIndex,
        }),
        broker: 'tradezero',
        account,
        date,
        amount,
        category: cls.category,
        kind: cls.kind,
        type,
        note,
        symbol: cls.symbol,
        qty: cls.qty,
        ratePerShare: cls.ratePerShare,
        forDate: cls.forDate,
        currency: (get('Currency') || 'USD').toUpperCase().slice(0, 3),
        importBatchId: ctx.importBatchId,
        sequence: index,
        raw: row,
      })
    })

    if (unknown > 0) {
      warnings.push(
        `${unknown} row(s) with an unrecognized type/note were imported as "other" costs`,
      )
    }
    return { executions: [], cashEntries, warnings, skippedRows }
  },
}

interface Classified {
  category: CashCategory
  kind: CashKind
  symbol?: string
  qty?: number
  ratePerShare?: number
  forDate?: string
}

export function classify(type: string, note: string, amount: number, date: string): Classified {
  const t = type.toLowerCase()
  const n = note.trim()

  const onb = ONB_RE.exec(n)
  if (onb || t.includes('borrow charge')) {
    const out: Classified = { category: 'borrow', kind: 'overnight-borrow' }
    if (onb) {
      out.qty = Number(onb[1])
      out.symbol = onb[2]!.toUpperCase()
      out.ratePerShare = Number(onb[3])
      out.forDate = resolveForDate(
        Number(onb[4]),
        Number(onb[5]),
        onb[6] ? Number(onb[6]) : undefined,
        date,
      )
    } else {
      const m = LOCATE_RE.exec(n)
      if (m) {
        out.qty = Number(m[1])
        out.symbol = m[2]!.toUpperCase()
        out.ratePerShare = Number(m[3])
      }
    }
    return out
  }

  if (t.includes('locate') || LOCATE_RE.test(n)) {
    const m = LOCATE_RE.exec(n)
    const lower = n.toLowerCase()
    const kind: CashKind = lower.includes('credit')
      ? 'locate-credit'
      : lower.startsWith('single-use')
        ? 'single-use'
        : lower.startsWith('pre-borrow')
          ? 'pre-borrow'
          : 'locate'
    return {
      category: 'locate',
      kind: amount > 0 && kind === 'locate' ? 'locate-credit' : kind,
      symbol: m ? m[2]!.toUpperCase() : undefined,
      qty: m ? Number(m[1]) : undefined,
      ratePerShare: m ? Number(m[3]) : undefined,
    }
  }

  if (t.includes('software') || t.includes('data') || /zeropro|platform|subscription/i.test(n)) {
    return { category: 'software', kind: 'platform' }
  }

  if (t.includes('banking') || /wire|ach|deposit|withdraw/i.test(n)) {
    if (/fee/i.test(n)) return { category: 'banking', kind: 'bank-fee' }
    return { category: 'banking', kind: amount >= 0 ? 'deposit' : 'withdrawal' }
  }

  return { category: 'other', kind: 'unknown' }
}

/** "for 08/15" has no year: take it from the entry date, rolling back a year if it would be in the future. */
function resolveForDate(
  month: number,
  day: number,
  year: number | undefined,
  entryDate: string,
): string {
  const entryYear = Number(entryDate.slice(0, 4))
  let y = year ?? entryYear
  const candidate = `${y}-${pad(month)}-${pad(day)}`
  if (!year && candidate > entryDate) y -= 1
  return `${y}-${pad(month)}-${pad(day)}`
}

function parseDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return null
  return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function num(s: string): number {
  if (!s) return NaN
  return Number(s.replace(/[$,]/g, ''))
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
