import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dropzone } from '@/components/dropzone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { allocateCashEntries } from '@/domain/allocation'
import { parseBackup, type Backup } from '@/domain/backup'
import { costOf, type CashEntry } from '@/domain/cash-entry'
import type { BrokerId, Execution } from '@/domain/execution'
import { matchExecutions, type MatchResult } from '@/domain/matcher'
import { parseCsv } from '@/importers/csv'
import { importers } from '@/importers/registry'
import type { BrokerImporter, ParseResult } from '@/importers/types'
import { fmtMoney, fmtNumber } from '@/lib/format'
import { hashId } from '@/lib/utils'
import { useCashEntries, useExecutions, useMatch } from '@/storage/hooks'
import {
  commitImport,
  partitionByExisting,
  partitionCashByExisting,
  restoreBackup,
  type RestoreMode,
} from '@/storage/repo'

type Stage =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'trades-preview'
      fileName: string
      importer: BrokerImporter
      parsed: ParseResult
      fresh: Execution[]
      duplicates: number
      match: MatchResult
      switched?: string
    }
  | {
      kind: 'cash-preview'
      fileName: string
      importer: BrokerImporter
      parsed: ParseResult
      fresh: CashEntry[]
      duplicates: number
      matchedToTrades: number
      unmatchedWithSymbol: number
      switched?: string
    }
  | { kind: 'backup-preview'; fileName: string; backup: Backup; fresh: number; duplicates: number }

function newBatchId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : hashId(`${Date.now()}-${Math.random()}`)
}

const BROKERS = [...new Map(importers.map((i) => [i.broker, i])).values()].map((i) => ({
  id: i.broker,
  label: i.name.split(' ')[0]!,
}))

export function ImportFlow({ kind }: { kind: 'broker' | 'backup' }) {
  const navigate = useNavigate()
  const existing = useExecutions()
  const existingCash = useCashEntries()
  const match = useMatch()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [broker, setBroker] = useState<BrokerId>(BROKERS[0]!.id)
  const [mode, setMode] = useState<RestoreMode>('merge')

  const brokerImporters = importers.filter((i) => i.broker === broker)

  async function onBrokerFile(file: File, chosen: BrokerImporter) {
    setStage({ kind: 'working', label: 'Reading file…' })
    try {
      const text = await file.text()
      const csv = parseCsv(text)
      let importer = chosen
      let switched: string | undefined
      if (!importer.detect(csv.headers)) {
        const other = brokerImporters.find((i) => i.detect(csv.headers))
        if (!other) {
          setStage({
            kind: 'error',
            message: `This does not look like a ${chosen.name} export. Columns found: ${csv.headers.slice(0, 8).join(', ')}${csv.headers.length > 8 ? '…' : ''}`,
          })
          return
        }
        importer = other
        switched = `This file is a ${other.name} export, so it was read as one.`
      }
      const parsed = importer.parse(csv.rows, { importBatchId: newBatchId() })

      if (importer.kind === 'trades') {
        if (!parsed.executions.length) {
          setStage({
            kind: 'error',
            message: `No trades found in this file. ${parsed.warnings[0] ?? ''}`,
          })
          return
        }
        const { fresh, duplicates } = await partitionByExisting(parsed.executions)
        const m = matchExecutions([...(existing ?? []), ...fresh])
        setStage({
          kind: 'trades-preview',
          fileName: file.name,
          importer,
          parsed,
          fresh,
          duplicates: duplicates.length,
          match: m,
          switched,
        })
      } else {
        if (!parsed.cashEntries.length) {
          setStage({
            kind: 'error',
            message: `No entries found in this file. ${parsed.warnings[0] ?? ''}`,
          })
          return
        }
        const { fresh, duplicates } = await partitionCashByExisting(parsed.cashEntries)
        const alloc = allocateCashEntries(match?.trades ?? [], fresh)
        setStage({
          kind: 'cash-preview',
          fileName: file.name,
          importer,
          parsed,
          fresh,
          duplicates: duplicates.length,
          matchedToTrades: alloc.allocatedCount,
          unmatchedWithSymbol: alloc.unallocated.length,
          switched,
        })
      }
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function onBackupFile(file: File) {
    setStage({ kind: 'working', label: 'Reading backup…' })
    try {
      const res = parseBackup(await file.text())
      if (!res.ok) {
        setStage({ kind: 'error', message: res.error })
        return
      }
      const ex = await partitionByExisting(res.backup.executions)
      const cash = await partitionCashByExisting(res.backup.cashEntries)
      setStage({
        kind: 'backup-preview',
        fileName: file.name,
        backup: res.backup,
        fresh: ex.fresh.length + cash.fresh.length,
        duplicates: ex.duplicates.length + cash.duplicates.length,
      })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function commit(s: Extract<Stage, { kind: 'trades-preview' | 'cash-preview' }>) {
    setStage({ kind: 'working', label: 'Saving to your browser…' })
    const batchId = (s.parsed.executions[0] ?? s.parsed.cashEntries[0])!.importBatchId
    await commitImport(
      {
        id: batchId,
        broker: s.importer.broker,
        importerId: s.importer.id,
        kind: s.importer.kind,
        fileName: s.fileName,
      },
      { executions: s.parsed.executions, cashEntries: s.parsed.cashEntries },
    )
    navigate(s.importer.kind === 'cash' ? '/fees' : '/dashboard')
  }

  async function commitBackup(s: Extract<Stage, { kind: 'backup-preview' }>) {
    setStage({ kind: 'working', label: 'Restoring…' })
    await restoreBackup(s.backup, mode)
    navigate('/dashboard')
  }

  if (stage.kind === 'working') {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {stage.label}
      </div>
    )
  }

  if (stage.kind === 'trades-preview') {
    const s = stage
    const gross = s.fresh.reduce((a, e) => a + e.grossProceeds, 0)
    const fees = s.fresh.reduce((a, e) => a + e.fees, 0)
    const newSymbols = new Set(s.fresh.map((e) => e.symbol)).size
    const dates = s.fresh.map((e) => e.tradeDate).sort()
    return (
      <PreviewCard title={s.fileName} badge={s.importer.name} switched={s.switched}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <Stat label="New executions" value={fmtNumber(s.fresh.length)} />
          <Stat label="Already imported" value={fmtNumber(s.duplicates)} muted />
          <Stat label="Symbols" value={fmtNumber(newSymbols)} />
          <Stat
            label="Period"
            value={dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '—'}
          />
          <Stat label="Gross proceeds" value={fmtMoney(gross, { sign: true })} />
          <Stat label="Commissions & fees" value={fmtMoney(fees)} />
          <Stat label="Net proceeds" value={fmtMoney(gross - fees, { sign: true })} />
          <Stat label="Resulting trades" value={fmtNumber(s.match.trades.length)} />
        </dl>
        {s.fresh.length === 0 && (
          <Notice tone="info">
            Every row in this file is already in your journal. Nothing to add.
          </Notice>
        )}
        {s.parsed.warnings.length > 0 && (
          <Notice tone="warn" title={`${s.parsed.warnings.length} parsing warning(s)`}>
            <WarningList items={s.parsed.warnings} />
          </Notice>
        )}
        {s.match.unmatched.length > 0 && (
          <Notice
            tone="warn"
            title={`${s.match.unmatched.length} fill(s) close positions that are not in your data`}
          >
            <p className="mb-1">
              Usually the position was opened before this export's date range. Import an earlier
              export and they will match automatically.
            </p>
            <WarningList items={s.match.warnings} />
          </Notice>
        )}
        {s.match.trades.some((t) => t.status === 'open') && (
          <Notice tone="info">
            {s.match.trades.filter((t) => t.status === 'open').length} position(s) are still open
            after this import. They are shown as open trades and excluded from statistics until
            closed.
          </Notice>
        )}
        <Actions
          onCommit={() => void commit(s)}
          disabled={s.fresh.length === 0}
          label={`Import ${fmtNumber(s.fresh.length)} executions`}
          onBack={() => setStage({ kind: 'idle' })}
        />
      </PreviewCard>
    )
  }

  if (stage.kind === 'cash-preview') {
    const s = stage
    const dates = s.fresh.map((e) => e.date).sort()
    const cost = (pred: (e: CashEntry) => boolean) =>
      s.fresh.filter(pred).reduce((a, e) => a + costOf(e), 0)
    const locates = cost((e) => e.category === 'locate')
    const borrow = cost((e) => e.category === 'borrow')
    const software = cost((e) => e.category === 'software')
    const banking = s.fresh.filter((e) => e.category === 'banking')
    const deposits = banking.filter((e) => e.kind === 'deposit').reduce((a, e) => a + e.amount, 0)
    const bankFees = cost((e) => e.kind === 'bank-fee')
    const attributable = s.matchedToTrades + s.unmatchedWithSymbol
    const noTrades = (match?.trades.length ?? 0) === 0
    return (
      <PreviewCard title={s.fileName} badge={s.importer.name} switched={s.switched}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <Stat label="New entries" value={fmtNumber(s.fresh.length)} />
          <Stat label="Already imported" value={fmtNumber(s.duplicates)} muted />
          <Stat
            label="Period"
            value={dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '—'}
          />
          <Stat
            label="Matched to trades"
            value={
              attributable ? `${fmtNumber(s.matchedToTrades)} of ${fmtNumber(attributable)}` : '—'
            }
          />
          <Stat label="Locate fees (net of credits)" value={fmtMoney(locates)} />
          <Stat label="Overnight borrow" value={fmtMoney(borrow)} />
          <Stat label="Software & data" value={fmtMoney(software)} />
          <Stat
            label="Deposits · bank fees"
            value={`${fmtMoney(deposits)} · ${fmtMoney(bankFees)}`}
          />
        </dl>
        {s.fresh.length === 0 && (
          <Notice tone="info">
            Every row in this file is already in your journal. Nothing to add.
          </Notice>
        )}
        {noTrades && s.fresh.length > 0 && (
          <Notice tone="info">
            No trades imported yet, so locates cannot be matched to trades right now. They will be
            matched automatically once you import the Trade History for the same period.
          </Notice>
        )}
        {!noTrades && s.unmatchedWithSymbol > 0 && (
          <Notice tone="info">
            {fmtNumber(s.unmatchedWithSymbol)} locate/borrow entries have no matching short trade.
            Those are counted as unused locates on the Fees page.
          </Notice>
        )}
        {s.parsed.warnings.length > 0 && (
          <Notice tone="warn" title={`${s.parsed.warnings.length} parsing warning(s)`}>
            <WarningList items={s.parsed.warnings} />
          </Notice>
        )}
        <Actions
          onCommit={() => void commit(s)}
          disabled={s.fresh.length === 0}
          label={`Import ${fmtNumber(s.fresh.length)} entries`}
          onBack={() => setStage({ kind: 'idle' })}
        />
      </PreviewCard>
    )
  }

  if (stage.kind === 'backup-preview') {
    const s = stage
    const existingCount = (existing?.length ?? 0) + (existingCash?.length ?? 0)
    const hasExisting = existingCount > 0
    return (
      <PreviewCard
        title={s.fileName}
        badge={`TradeDNA backup v${s.backup.schemaVersion}`}
        description={`Exported ${new Date(s.backup.exportedAt).toLocaleString()}`}
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <Stat label="Executions" value={fmtNumber(s.backup.executions.length)} />
          <Stat label="Cash entries" value={fmtNumber(s.backup.cashEntries.length)} />
          <Stat label="New to this browser" value={fmtNumber(s.fresh)} />
          <Stat label="Already present" value={fmtNumber(s.duplicates)} muted />
        </dl>
        {hasExisting && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Existing data:</span>
            <Segmented
              size="md"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Merge (keep both)' },
                { value: 'replace', label: 'Replace with backup' },
              ]}
            />
          </div>
        )}
        {mode === 'replace' && hasExisting && (
          <Notice tone="warn">
            Replace deletes the {fmtNumber(existingCount)} records currently in this browser before
            restoring.
          </Notice>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            onClick={() => void commitBackup(s)}
            variant={mode === 'replace' && hasExisting ? 'destructive' : 'default'}
          >
            <CheckCircle2 />{' '}
            {mode === 'replace' && hasExisting ? 'Replace and restore' : 'Restore backup'}
          </Button>
          <Button variant="ghost" onClick={() => setStage({ kind: 'idle' })}>
            Choose another file
          </Button>
        </div>
      </PreviewCard>
    )
  }

  // idle / error
  return (
    <div className="space-y-4">
      {kind === 'broker' && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Broker</span>
            <Segmented
              size="md"
              value={broker}
              onChange={setBroker}
              options={BROKERS.map((b) => ({ value: b.id, label: b.label }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {brokerImporters.map((imp) => (
              <Dropzone
                key={imp.id}
                accept=".csv,text/csv"
                title={imp.name}
                hint={imp.exportHint}
                onFile={(f) => void onBrokerFile(f, imp)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Overlapping date ranges are fine — duplicates are skipped. Import both files to see
            locates and borrow charges on your trades.
          </p>
        </>
      )}
      {kind === 'backup' && (
        <Dropzone
          accept=".json,application/json"
          title="Drop your TradeDNA backup (.json) here, or click to browse"
          hint="Created from Export backup on any device."
          onFile={(f) => void onBackupFile(f)}
        />
      )}
      {stage.kind === 'error' && (
        <Notice tone="error" title="Could not import">
          {stage.message}
        </Notice>
      )}
    </div>
  )
}

function PreviewCard({
  title,
  badge,
  description,
  switched,
  children,
}: {
  title: string
  badge: string
  description?: string
  switched?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" /> {title}
          <Badge variant="outline">{badge}</Badge>
        </CardTitle>
        <CardDescription>
          {description ?? 'Review what will be added. Nothing is saved until you confirm.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {switched && <Notice tone="info">{switched}</Notice>}
        {children}
      </CardContent>
    </Card>
  )
}

function Actions({
  onCommit,
  disabled,
  label,
  onBack,
}: {
  onCommit: () => void
  disabled: boolean
  label: string
  onBack: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button onClick={onCommit} disabled={disabled}>
        <CheckCircle2 /> {label}
      </Button>
      <Button variant="ghost" onClick={onBack}>
        Choose another file
      </Button>
    </div>
  )
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-medium tabular ${muted ? 'text-muted-foreground' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'error'
  title?: string
  children: React.ReactNode
}) {
  const cls =
    tone === 'error'
      ? 'border-loss/40 bg-loss/10'
      : tone === 'warn'
        ? 'border-fee/40 bg-fee/10'
        : 'border-border bg-muted/40'
  return (
    <div className={`rounded-lg border p-3 text-sm ${cls}`}>
      {title && (
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          {tone !== 'info' && <AlertTriangle className="size-4" />}
          {title}
        </div>
      )}
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}

function WarningList({ items }: { items: string[] }) {
  const shown = items.slice(0, 5)
  return (
    <ul className="list-disc pl-5 space-y-0.5 text-xs">
      {shown.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
      {items.length > shown.length && <li>…and {items.length - shown.length} more</li>}
    </ul>
  )
}
