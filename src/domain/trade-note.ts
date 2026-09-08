import { z } from 'zod'
import type { Trade } from './trade'

/**
 * The trader's own annotations on a trade: free-form tags and a note.
 *
 * Keyed by trade id, which is derived from the first execution's content hash, so a note survives
 * re-imports, backups and matcher improvements. (If an earlier export later reveals the position
 * was opened before the fill we knew about, the trade gets a new id and the note is orphaned.)
 */
export const TradeNoteSchema = z.object({
  tradeId: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  note: z.string().default(''),
  updatedAt: z.number().int(),
})
export type TradeNote = z.infer<typeof TradeNoteSchema>

export const MAX_TAG_LENGTH = 32

/** Tags are lowercase, single-spaced and short, so "FOMO", "Fomo " and "fomo" are one tag. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH)
}

export function normalizeTags(raw: string[]): string[] {
  const out: string[] = []
  for (const r of raw) {
    const t = normalizeTag(r)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Shown as one-click suggestions until the trader has tags of their own. */
export const SUGGESTED_TAGS = [
  'a+ setup',
  'followed plan',
  'fomo',
  'chased',
  'revenge',
  'oversized',
  'early exit',
  'held too long',
  'no stop',
  'news',
]

/** True when the note has anything worth keeping. */
export function hasContent(n: Pick<TradeNote, 'tags' | 'note'>): boolean {
  return n.tags.length > 0 || n.note.trim().length > 0
}

/**
 * Attach notes to trades. Trades without a note are returned as the same object, so memoized
 * consumers only see new references where something actually changed.
 */
export function applyNotes(trades: Trade[], notes: TradeNote[]): Trade[] {
  if (!notes.length) return trades
  const byId = new Map(notes.map((n) => [n.tradeId, n]))
  return trades.map((t) => {
    const n = byId.get(t.id)
    if (!n || !hasContent(n)) return t
    return { ...t, tags: n.tags, note: n.note.trim() || undefined }
  })
}

export interface TagCount {
  tag: string
  count: number
}

/** Every tag in use, most used first, then alphabetical. */
export function collectTags(notes: TradeNote[]): TagCount[] {
  const counts = new Map<string, number>()
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
}
