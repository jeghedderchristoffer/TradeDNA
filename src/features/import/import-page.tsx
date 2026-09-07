import { useState } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { ImportFlow } from './import-flow'

export function ImportPage() {
  const [kind, setKind] = useState<'broker' | 'backup'>('broker')
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Import</h1>
          <p className="text-sm text-muted-foreground">
            Add more trades from a broker export, or restore a backup.
          </p>
        </div>
        <Segmented
          size="md"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'broker', label: 'Broker export' },
            { value: 'backup', label: 'TradeDNA backup' },
          ]}
        />
      </div>
      <ImportFlow key={kind} kind={kind} />
    </div>
  )
}
