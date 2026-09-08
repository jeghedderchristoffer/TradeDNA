import {
  BarChart3,
  CalendarDays,
  Dna,
  Hash,
  LayoutDashboard,
  List,
  Receipt,
  Settings,
  Upload,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { useExecutions, useSettings } from '@/storage/hooks'
import { downloadBackup } from '@/storage/repo'

export const REPO_URL = 'https://github.com/jeghedderchristoffer/TradeDNA'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/fees', label: 'Fees', icon: Receipt },
  { to: '/symbols', label: 'Symbols', icon: Hash },
  { to: '/trades', label: 'Trades', icon: List },
]

/** GitHub mark. Lucide dropped brand icons, so it is inlined. */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/**
 * Header: brand, page nav, the two global filters, Import, Settings, GitHub.
 * Nav labels show only on wide screens (icons with tooltips below that); Export lives in the
 * footer next to the sentence that tells you to keep a backup.
 */
export function AppShell() {
  const [settings, setSetting] = useSettings()
  const executions = useExecutions()
  const navigate = useNavigate()
  const hasData = (executions?.length ?? 0) > 0
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <NavLink to="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <Dna className="size-5" />
            <span className="hidden sm:inline">TradeDNA</span>
          </NavLink>
          <nav className="hidden md:flex items-center gap-0.5 ml-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                title={n.label}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )
                }
              >
                <n.icon className="size-4" />
                <span className="hidden xl:inline">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Segmented
              options={[
                { value: 'all', label: 'All' },
                { value: 'long', label: 'Long' },
                { value: 'short', label: 'Short' },
              ]}
              value={settings.direction}
              onChange={(v) => void setSetting('direction', v)}
            />
            <Segmented
              options={[
                { value: 'net', label: 'Net' },
                { value: 'gross', label: 'Gross' },
              ]}
              value={settings.pnlBasis}
              onChange={(v) => void setSetting('pnlBasis', v)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/import')}
              title="Import a broker export or restore a backup"
              className="ml-1"
            >
              <Upload /> <span className="hidden lg:inline">Import</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              title="Settings"
              onClick={() => navigate('/settings')}
            >
              <Settings />
            </Button>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="TradeDNA on GitHub"
              title="Source code on GitHub"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                'hidden sm:inline-flex',
              )}
            >
              <GitHubIcon className="size-4" />
            </a>
          </div>
        </div>
        <nav className="md:hidden flex border-t">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
                )
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <span>All data stays in this browser. Nothing is uploaded anywhere. </span>
        <button
          type="button"
          onClick={() => void downloadBackup()}
          disabled={!hasData}
          className="underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-60"
          title="Download a JSON backup of everything in this browser"
        >
          Export a backup
        </button>
        <span> to keep it safe.</span>
        <span className="mx-2">·</span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 align-middle hover:text-foreground"
        >
          <GitHubIcon className="size-3" /> Open source on GitHub
        </a>
      </footer>
    </div>
  )
}
