import Papa from 'papaparse'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
}

/** Parse CSV text into header-keyed rows. Trims headers, skips blank lines, never throws. */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`),
  }
}
