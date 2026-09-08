import { describe, expect, it } from 'vitest'
import { byTag, filterTrades } from './metrics'
import type { Trade } from './trade'
import { applyNotes, collectTags, hasContent, normalizeTag, normalizeTags } from './trade-note'

function trade(id: string, net: number, tags?: string[]): Trade {
  return {
    id,
    symbol: 'ABC',
    direction: 'long',
    status: 'closed',
    entryTime: 1,
    exitTime: 2,
    entryDate: '2026-01-05',
    exitDate: '2026-01-05',
    isOvernight: false,
    daysHeld: 0,
    qty: 100,
    openQty: 0,
    avgEntry: 10,
    avgExit: 10 + net / 100,
    grossPnl: net,
    fees: 0,
    tradingFees: 0,
    locateFees: 0,
    borrowFees: 0,
    feeBreakdown: {},
    netPnl: net,
    holdMs: 1,
    executionIds: [],
    fills: [],
    tags,
  }
}

describe('trade notes', () => {
  it('normalizes tags to lowercase, single-spaced, deduped', () => {
    expect(normalizeTag('  FOMO ')).toBe('fomo')
    expect(normalizeTag('Held   too\tlong')).toBe('held too long')
    expect(normalizeTag('x'.repeat(50))).toHaveLength(32)
    expect(normalizeTags(['Fomo', 'fomo', '', '  ', 'Chased'])).toEqual(['fomo', 'chased'])
  })

  it('knows when a note is empty', () => {
    expect(hasContent({ tags: [], note: '  \n' })).toBe(false)
    expect(hasContent({ tags: ['a'], note: '' })).toBe(true)
    expect(hasContent({ tags: [], note: 'hi' })).toBe(true)
  })

  it('attaches notes to trades without touching the others', () => {
    const a = trade('a', 10)
    const b = trade('b', -5)
    const out = applyNotes(
      [a, b],
      [
        { tradeId: 'a', tags: ['fomo'], note: '  chased the open  ', updatedAt: 1 },
        { tradeId: 'zzz', tags: ['orphan'], note: '', updatedAt: 1 },
      ],
    )
    expect(out[0]).not.toBe(a)
    expect(out[0]!.tags).toEqual(['fomo'])
    expect(out[0]!.note).toBe('chased the open')
    expect(out[1]).toBe(b)
    expect(applyNotes([a, b], [])).toEqual([a, b])
  })

  it('filters by tag and by untagged', () => {
    const ts = [trade('a', 1, ['fomo']), trade('b', 1, ['fomo', 'a+ setup']), trade('c', 1)]
    expect(filterTrades(ts, { tags: ['fomo'] }).map((t) => t.id)).toEqual(['a', 'b'])
    expect(filterTrades(ts, { tags: ['a+ setup'] }).map((t) => t.id)).toEqual(['b'])
    expect(filterTrades(ts, { tags: ['nope'] })).toEqual([])
    expect(filterTrades(ts, { untagged: true }).map((t) => t.id)).toEqual(['c'])
    // tags win over untagged
    expect(filterTrades(ts, { tags: ['fomo'], untagged: true }).map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('buckets by tag with overlap, best first', () => {
    const ts = [
      trade('a', 100, ['fomo']),
      trade('b', -30, ['fomo', 'oversized']),
      trade('c', 50, ['a+ setup']),
      trade('d', 5),
    ]
    const buckets = byTag(ts, 'net')
    expect(buckets.map((b) => [b.key, b.count, b.pnl])).toEqual([
      ['fomo', 2, 70],
      ['a+ setup', 1, 50],
      ['oversized', 1, -30],
    ])
    expect(byTag([trade('d', 5)], 'net')).toEqual([])
  })

  it('collects tags most used first', () => {
    const tags = collectTags([
      { tradeId: '1', tags: ['b', 'a'], note: '', updatedAt: 1 },
      { tradeId: '2', tags: ['b'], note: '', updatedAt: 1 },
      { tradeId: '3', tags: ['c'], note: '', updatedAt: 1 },
    ])
    expect(tags).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
      { tag: 'c', count: 1 },
    ])
  })
})
