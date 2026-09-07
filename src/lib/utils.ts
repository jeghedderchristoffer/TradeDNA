import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Deterministic, synchronous content hash (two independent cyrb53 passes → 106 bits).
 * Used for stable execution ids so re-importing an overlapping export dedupes cleanly.
 */
export function hashId(input: string): string {
  return (
    cyrb53(input, 0x9e3779b9).toString(16).padStart(14, '0') +
    cyrb53(input, 0x85ebca6b).toString(16).padStart(14, '0')
  )
}

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Round to cents to avoid float noise in sums (e.g. 821.0000000000001). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}
