import { compareExecutions, isOpeningSide, type Execution } from './execution'
import type { Direction, Trade, TradeFill } from './trade'
import { dateKey, daysBetween } from '@/lib/dates'

export interface UnmatchedExecution {
  executionId: string
  symbol: string
  timestamp: number
  /** Portion of the execution that could not be matched. */
  qty: number
  reason: 'orphan-close' | 'over-close' | 'side-conflict'
}

export interface MatchResult {
  trades: Trade[]
  unmatched: UnmatchedExecution[]
  warnings: string[]
}

export interface MatchOptions {
  /** Reference "now" for open trades (daysHeld). Defaults to Date.now(). */
  asOf?: number
}

/**
 * Position-based (flat → non-flat → flat) matcher.
 *
 * Walks each symbol's executions chronologically across the WHOLE history (never resets per day),
 * so overnight / multi-day positions become a single trade. A fill that crosses through zero is
 * split: the first part closes the current trade, the remainder opens a new opposite one.
 *
 * Closing-only sides (`sell`, `cover`) never invent a position: with nothing open they are
 * reported as `orphan-close` (typically an export that starts mid-position).
 */
export function matchExecutions(executions: Execution[], opts: MatchOptions = {}): MatchResult {
  const asOf = opts.asOf ?? Date.now()
  const groups = new Map<string, Execution[]>()
  for (const e of executions) {
    const key = `${e.account ?? ''}|${e.symbol}`
    const list = groups.get(key)
    if (list) list.push(e)
    else groups.set(key, [e])
  }

  const trades: Trade[] = []
  const unmatched: UnmatchedExecution[] = []
  const warnings: string[] = []

  for (const list of groups.values()) {
    list.sort(compareExecutions)
    let open: OpenPosition | null = null

    for (const e of list) {
      let remaining = e.qty
      // guard against pathological loops
      let iterations = 0
      while (remaining > 0 && iterations++ < 4) {
        if (!open) {
          if (isOpeningSide(e.side)) {
            open = newPosition(e, e.side === 'buy' ? 'long' : 'short')
            addFill(open, e, 'entry', remaining)
            remaining = 0
          } else {
            unmatched.push({
              executionId: e.id,
              symbol: e.symbol,
              timestamp: e.timestamp,
              qty: remaining,
              reason: 'orphan-close',
            })
            warnings.push(
              `${e.symbol} ${e.tradeDate}: ${e.side} of ${remaining} has no open position (position was opened before this export?)`,
            )
            remaining = 0
          }
          continue
        }

        const dir = open.direction
        const addsToPosition =
          (e.side === 'buy' && dir === 'long') || (e.side === 'short' && dir === 'short')
        const explicitClose =
          (e.side === 'sell' && dir === 'long') || (e.side === 'cover' && dir === 'short')
        const opposingOpener =
          (e.side === 'buy' && dir === 'short') || (e.side === 'short' && dir === 'long')

        if (addsToPosition) {
          addFill(open, e, 'entry', remaining)
          remaining = 0
        } else if (explicitClose || opposingOpener) {
          const applied = Math.min(remaining, open.position)
          addFill(open, e, 'exit', applied)
          remaining -= applied
          if (open.position <= EPS) {
            trades.push(finalize(open, asOf))
            open = null
          }
          if (remaining > 0 && explicitClose) {
            // sell/cover larger than the position: data problem, do not open the opposite side
            unmatched.push({
              executionId: e.id,
              symbol: e.symbol,
              timestamp: e.timestamp,
              qty: remaining,
              reason: 'over-close',
            })
            warnings.push(
              `${e.symbol} ${e.tradeDate}: ${e.side} of ${e.qty} exceeds the open ${dir} position by ${remaining} — excess ignored`,
            )
            remaining = 0
          }
          // opposingOpener with remaining > 0 loops back and opens the new opposite trade
        } else {
          // cover while long, or sell while short: contradictory tagging
          unmatched.push({
            executionId: e.id,
            symbol: e.symbol,
            timestamp: e.timestamp,
            qty: remaining,
            reason: 'side-conflict',
          })
          warnings.push(
            `${e.symbol} ${e.tradeDate}: ${e.side} of ${remaining} while ${dir} — conflicting side, ignored`,
          )
          remaining = 0
        }
      }
    }

    if (open) trades.push(finalize(open, asOf))
  }

  trades.sort((a, b) => a.entryTime - b.entryTime || a.id.localeCompare(b.id))
  return { trades, unmatched, warnings }
}

const EPS = 1e-9

interface OpenPosition {
  id: string
  symbol: string
  account?: string
  direction: Direction
  position: number
  maxQty: number
  entryQty: number
  entryCost: number
  exitQty: number
  exitProceeds: number
  fees: number
  feeBreakdown: Record<string, number>
  fills: TradeFill[]
  executionIds: string[]
}

function newPosition(e: Execution, direction: Direction): OpenPosition {
  return {
    id: `t_${e.id}`,
    symbol: e.symbol,
    account: e.account,
    direction,
    position: 0,
    maxQty: 0,
    entryQty: 0,
    entryCost: 0,
    exitQty: 0,
    exitProceeds: 0,
    fees: 0,
    feeBreakdown: {},
    fills: [],
    executionIds: [],
  }
}

function addFill(p: OpenPosition, e: Execution, role: 'entry' | 'exit', qty: number) {
  const share = qty / e.qty
  const fees = e.fees * share
  let feeBreakdown: Record<string, number> | undefined
  if (e.feeBreakdown) {
    feeBreakdown = {}
    for (const [k, v] of Object.entries(e.feeBreakdown)) {
      const part = v * share
      feeBreakdown[k] = part
      p.feeBreakdown[k] = (p.feeBreakdown[k] ?? 0) + part
    }
  }
  p.fills.push({
    executionId: e.id,
    role,
    timestamp: e.timestamp,
    qty,
    price: e.price,
    fees,
    feeBreakdown,
  })
  if (!p.executionIds.includes(e.id)) p.executionIds.push(e.id)
  p.fees += fees
  if (role === 'entry') {
    p.position += qty
    p.entryQty += qty
    p.entryCost += qty * e.price
    if (p.position > p.maxQty) p.maxQty = p.position
  } else {
    p.position -= qty
    p.exitQty += qty
    p.exitProceeds += qty * e.price
  }
}

function finalize(p: OpenPosition, asOf: number): Trade {
  const closed = p.position <= EPS
  const first = p.fills[0]!
  const lastExit = closed ? p.fills[p.fills.length - 1]! : undefined
  const avgEntry = p.entryQty > 0 ? p.entryCost / p.entryQty : 0
  const avgExit = p.exitQty > 0 ? p.exitProceeds / p.exitQty : undefined

  // Realized P&L on the closed portion (for closed trades exitQty === entryQty).
  const grossPnl =
    p.direction === 'long'
      ? p.exitProceeds - avgEntry * p.exitQty
      : avgEntry * p.exitQty - p.exitProceeds
  const netPnl = grossPnl - p.fees

  const entryDate = dateKey(first.timestamp)
  const exitDate = lastExit ? dateKey(lastExit.timestamp) : undefined
  const daysHeld = Math.max(0, daysBetween(entryDate, exitDate ?? dateKey(asOf)))

  return {
    id: p.id,
    symbol: p.symbol,
    account: p.account,
    direction: p.direction,
    status: closed ? 'closed' : 'open',
    entryTime: first.timestamp,
    exitTime: lastExit?.timestamp,
    entryDate,
    exitDate,
    isOvernight: daysHeld > 0,
    daysHeld,
    qty: p.maxQty,
    openQty: closed ? 0 : p.position,
    avgEntry,
    avgExit,
    grossPnl,
    fees: p.fees,
    tradingFees: p.fees,
    locateFees: 0,
    borrowFees: 0,
    feeBreakdown: p.feeBreakdown,
    netPnl,
    returnPct: p.entryCost > 0 ? (netPnl / p.entryCost) * 100 : undefined,
    holdMs: lastExit ? lastExit.timestamp - first.timestamp : undefined,
    executionIds: p.executionIds,
    fills: p.fills,
  }
}
