import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { normalizeTag, SUGGESTED_TAGS } from '@/domain/trade-note'
import type { TagCount } from '@/domain/trade-note'
import { cn } from '@/lib/utils'

/**
 * Chip-style tag input. Enter or comma adds the typed tag, Backspace on an empty field removes
 * the last one. Below the field: the trader's own tags (most used first) as one-click chips,
 * falling back to a starter set until they have some.
 */
export function TagEditor({
  value,
  onChange,
  known,
  className,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  /** Every tag in use across the journal. */
  known: TagCount[]
  className?: string
}) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const tag = normalizeTag(raw)
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag))

  const pool = known.length ? known.map((k) => k.tag) : SUGGESTED_TAGS
  const needle = normalizeTag(draft)
  const suggestions = pool
    .filter((t) => !value.includes(t) && (!needle || t.includes(needle)))
    .slice(0, 12)

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring"
        onClick={(e) =>
          (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()
        }
      >
        {value.map((tag) => (
          <Badge key={tag} variant="default" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              className="rounded-sm p-0.5 hover:bg-foreground/10"
              onClick={(e) => {
                e.stopPropagation()
                remove(tag)
              }}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',')) {
              v.split(',').forEach((part) => part.trim() && add(part))
              return
            }
            setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              remove(value[value.length - 1]!)
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? 'Add tag…' : 'Add a tag and press Enter…'}
          aria-label="Add tag"
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {known.length ? 'Your tags' : 'Ideas'}
          </span>
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="inline-flex items-center gap-0.5 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
            >
              <Plus className="size-3" />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
