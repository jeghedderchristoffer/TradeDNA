import {
  BarChart3,
  CalendarDays,
  Dna,
  Download,
  LayoutDashboard,
  List,
  Receipt,
  Settings,
  Upload,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { useExecutions, useSettings } from '@/storage/hooks'
import { downloadBackup } from '@/storage/repo'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/fees', label: 'Fees', icon: Receipt },
  { to: '/trades', label: 'Trades', icon: List },
]

export function AppShell() {
  const [settings, setSetting] = useSettings()
  const executions = useExecutions()
  const navigate = useNavigate()
  const hasData = (executions?.length ?? 0) > 0
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <NavLink to="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <Dna className="size-5" />
            TradeDNA
          </NavLink>
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )
                }
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
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
            <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
              <Upload /> Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void downloadBackup()}
              disabled={!hasData}
              title="Download a JSON backup of everything in this browser"
            >
              <Download /> <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={() => navigate('/settings')}
            >
              <Settings />
            </Button>
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
        All data stays in this browser. Nothing is uploaded anywhere. Export a backup to keep it
        safe.
      </footer>
    </div>
  )
}
