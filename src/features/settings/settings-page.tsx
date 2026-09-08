import { Download, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { getImporter } from '@/importers/registry'
import { fmtDateTime, fmtNumber } from '@/lib/format'
import {
  useCashEntries,
  useExecutions,
  useImportBatches,
  useMatch,
  useSettings,
} from '@/storage/hooks'
import { clearAllData, deleteImportBatch, downloadBackup } from '@/storage/repo'

export function SettingsPage() {
  const [settings, setSetting] = useSettings()
  const batches = useImportBatches()
  const executions = useExecutions()
  const cash = useCashEntries()
  const match = useMatch()
  const [confirmClear, setConfirmClear] = useState(false)
  const total = (executions?.length ?? 0) + (cash?.length ?? 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your data, your device.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>
            A single JSON file with every execution and cash entry you imported, plus your tags and
            notes. Keep it somewhere safe: clearing your browser data deletes the journal, and the
            backup is the only way to get it back.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void downloadBackup()} disabled={total === 0}>
            <Download /> Export backup ({fmtNumber(executions?.length ?? 0)} executions
            {cash?.length ? `, ${fmtNumber(cash.length)} cash entries` : ''})
          </Button>
          <Link to="/import" className={buttonVariants({ variant: 'outline' })}>
            Restore or import
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">P&amp;L basis</div>
              <div className="text-xs text-muted-foreground">
                Net deducts commissions, fees and attributed locate/borrow costs. Also in the
                header.
              </div>
            </div>
            <Segmented
              size="md"
              value={settings.pnlBasis}
              onChange={(v) => void setSetting('pnlBasis', v)}
              options={[
                { value: 'net', label: 'Net' },
                { value: 'gross', label: 'Gross' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">Direction</div>
              <div className="text-xs text-muted-foreground">
                Show all trades, only longs or only shorts on every page. Also in the header.
              </div>
            </div>
            <Segmented
              size="md"
              value={settings.direction}
              onChange={(v) => void setSetting('direction', v)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'long', label: 'Long' },
                { value: 'short', label: 'Short' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="font-medium">Theme</div>
            <Segmented
              size="md"
              value={settings.theme}
              onChange={(v) => void setSetting('theme', v)}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Imports</CardTitle>
          <CardDescription>Deleting an import removes only the records it added.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {batches?.length ? (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>When</TH>
                  <TH>Source</TH>
                  <TH>File</TH>
                  <TH className="text-right">Rows</TH>
                  <TH className="text-right">Added</TH>
                  <TH className="text-right">Duplicates</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD className="tabular">{fmtDateTime(b.importedAt)}</TD>
                    <TD>
                      {getImporter(b.importerId ?? b.broker).name}{' '}
                      <Badge variant="outline">{b.kind === 'cash' ? 'cash' : 'trades'}</Badge>
                    </TD>
                    <TD className="max-w-56 truncate" title={b.fileName}>
                      {b.fileName}
                    </TD>
                    <TD className="text-right tabular">{fmtNumber(b.rowCount)}</TD>
                    <TD className="text-right tabular">{fmtNumber(b.newCount)}</TD>
                    <TD className="text-right tabular text-muted-foreground">
                      {fmtNumber(b.duplicateCount)}
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete import"
                        onClick={() => {
                          if (confirm(`Delete this import and its ${b.newCount} records?`))
                            void deleteImportBatch(b.id)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="px-5 pb-5 text-sm text-muted-foreground">No imports yet.</div>
          )}
        </CardContent>
      </Card>

      {match && match.unmatched.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unmatched fills ({match.unmatched.length})</CardTitle>
            <CardDescription>
              These executions close positions the app has never seen opened. Import an earlier
              export to resolve them; they are excluded from all statistics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {match.warnings.slice(0, 20).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {match.warnings.length > 20 && <li>…and {match.warnings.length - 20} more</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            TradeDNA is a static web app. Everything you import is parsed in this tab and stored in
            your browser's IndexedDB. There is no server, no account and no analytics. The only way
            your data leaves this device is when you export a backup yourself.
          </p>
          <p>Trade times are interpreted in US Eastern time, matching TradeZero exports.</p>
        </CardContent>
      </Card>

      <Card className="border-loss/40">
        <CardHeader>
          <CardTitle>Delete everything</CardTitle>
          <CardDescription>
            Removes all executions, cash entries, imports, notes, tags and settings from this
            browser. Export a backup first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!confirmClear ? (
            <Button variant="outline" onClick={() => setConfirmClear(true)}>
              <Trash2 /> Delete all data…
            </Button>
          ) : (
            <>
              <Button
                variant="destructive"
                onClick={() =>
                  void clearAllData().then(() => {
                    setConfirmClear(false)
                    window.location.hash = '#/'
                  })
                }
              >
                Yes, delete {fmtNumber(total)} records
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
