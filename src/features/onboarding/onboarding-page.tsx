import { Database, Dna, FileUp, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ImportFlow } from '@/features/import/import-flow'
import { importers } from '@/importers/registry'
import { cn } from '@/lib/utils'

type Choice = 'broker' | 'backup' | null

export function OnboardingPage() {
  const [choice, setChoice] = useState<Choice>(null)

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-16">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Dna className="size-7" /> TradeDNA
          </div>
          <p className="text-muted-foreground text-balance">
            Import your broker trade history and see how you actually trade: P&amp;L, fees, win
            rate, hold times, long vs short, day by day.
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Everything stays in your browser. No account, no
            upload, no tracking.
          </p>
        </div>

        {choice === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceCard
              icon={FileUp}
              title="Import from broker"
              description={`Upload your Trade History, and optionally the Cash Journal for locate, borrow and software costs. Supported: ${[...new Set(importers.map((i) => i.name.split(' ')[0]))].join(', ')}.`}
              cta="Choose broker export"
              onClick={() => setChoice('broker')}
            />
            <ChoiceCard
              icon={Database}
              title="Upload TradeDNA backup"
              description="Restore a .json backup you exported earlier from TradeDNA on this or another device."
              cta="Choose backup file"
              onClick={() => setChoice('backup')}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">
                {choice === 'broker' ? 'Import from broker' : 'Upload TradeDNA backup'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setChoice(null)}>
                Back
              </Button>
            </div>
            <ImportFlow kind={choice} />
          </div>
        )}
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        Open source · your data never leaves this device
      </footer>
    </div>
  )
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  cta,
  onClick,
}: {
  icon: typeof FileUp
  title: string
  description: string
  cta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start gap-3 rounded-xl border bg-card p-6 text-left shadow-sm transition-colors cursor-pointer',
        'hover:border-ring hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="rounded-lg bg-muted p-2.5">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="mt-auto text-sm font-medium text-primary group-hover:underline">
        {cta} →
      </span>
    </button>
  )
}
