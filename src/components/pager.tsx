import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fmtNumber } from '@/lib/format'
import { Button } from './ui/button'
import { Segmented } from './ui/segmented'

export const PAGE_SIZES = [25, 50, 100, 250] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export interface Pagination<T> {
  page: number
  pageCount: number
  pageSize: PageSize
  start: number
  end: number
  total: number
  items: T[]
  setPage: (p: number) => void
  setPageSize: (s: PageSize) => void
}

/**
 * Client-side pagination over an in-memory list. `resetKey` describes what is being listed
 * (filters, sort, range...); when it changes the pager goes back to the first page.
 */
export function usePagination<T>(
  all: T[],
  resetKey: string,
  initialSize: PageSize = 50,
): Pagination<T> {
  const [pageSize, setPageSize] = useState<PageSize>(initialSize)
  const [state, setState] = useState({ key: '', page: 0 })
  const key = `${resetKey}|${pageSize}`
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize))
  const page = Math.min(state.key === key ? state.page : 0, pageCount - 1)
  const start = page * pageSize
  const end = Math.min(start + pageSize, all.length)
  const items = useMemo(() => all.slice(start, end), [all, start, end])
  return {
    page,
    pageCount,
    pageSize,
    start,
    end,
    total: all.length,
    items,
    setPage: (p) => setState({ key, page: Math.max(0, Math.min(p, pageCount - 1)) }),
    setPageSize,
  }
}

export function Pager<T>({ p, noun = 'rows' }: { p: Pagination<T>; noun?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular">
        {p.total === 0
          ? `No ${noun}`
          : `${fmtNumber(p.start + 1)}–${fmtNumber(p.end)} of ${fmtNumber(p.total)} ${noun}`}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2">Per page</span>
        <Segmented
          value={String(p.pageSize) as `${PageSize}`}
          onChange={(v) => p.setPageSize(Number(v) as PageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n) as `${PageSize}`, label: String(n) }))}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="First page"
          disabled={p.page === 0}
          onClick={() => p.setPage(0)}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous page"
          disabled={p.page === 0}
          onClick={() => p.setPage(p.page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular px-1">
          Page {fmtNumber(p.page + 1)} of {fmtNumber(p.pageCount)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next page"
          disabled={p.page >= p.pageCount - 1}
          onClick={() => p.setPage(p.page + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Last page"
          disabled={p.page >= p.pageCount - 1}
          onClick={() => p.setPage(p.pageCount - 1)}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  )
}
