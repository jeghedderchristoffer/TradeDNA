import { tradezero } from './tradezero'
import { tradezeroCash } from './tradezero-cash'
import type { BrokerImporter } from './types'

/** Register new importers here. Order matters only for auto-detect ties. */
export const importers: readonly BrokerImporter[] = [tradezero, tradezeroCash]

export function getImporter(id: string): BrokerImporter {
  const found = importers.find((i) => i.id === id) ?? legacy(id)
  if (!found) throw new Error(`Unknown importer: ${id}`)
  return found
}

/** Batches stored before importer ids existed carry the broker id. */
function legacy(id: string): BrokerImporter | undefined {
  return importers.find((i) => i.broker === id && i.kind === 'trades')
}

export function detectImporter(headers: string[]): BrokerImporter | undefined {
  return importers.find((i) => i.detect(headers))
}
