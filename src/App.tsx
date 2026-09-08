import { Loader2 } from 'lucide-react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/app/shell'
import { PageSkeleton } from '@/components/ui/skeleton'
import { ThemeEffect } from '@/app/theme'
import { AnalyticsPage } from '@/features/analytics/analytics-page'
import { CalendarPage } from '@/features/calendar/calendar-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { FeesPage } from '@/features/fees/fees-page'
import { ImportPage } from '@/features/import/import-page'
import { OnboardingPage } from '@/features/onboarding/onboarding-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { SymbolPage } from '@/features/symbols/symbol-page'
import { SymbolsPage } from '@/features/symbols/symbols-page'
import { TradePage } from '@/features/trades/trade-page'
import { TradesPage } from '@/features/trades/trades-page'
import { useExecutions } from '@/storage/hooks'

/** "/" shows onboarding until there is data, then the dashboard. */
function Root() {
  const executions = useExecutions()
  if (executions === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  return executions.length === 0 ? <OnboardingPage /> : <Navigate to="/dashboard" replace />
}

/** Data pages redirect to onboarding when the browser has no data yet. */
function RequireData({ children }: { children: React.ReactNode }) {
  const executions = useExecutions()
  if (executions === undefined) return <PageSkeleton />

  if (executions.length === 0) return <Navigate to="/" replace />
  return <>{children}</>
}

// Hash routing keeps deep links working on any static host (GitHub Pages included).
const router = createHashRouter([
  { path: '/', element: <Root /> },
  {
    element: <AppShell />,
    children: [
      { path: '/import', element: <ImportPage /> },
      { path: '/settings', element: <SettingsPage /> },
      {
        path: '/dashboard',
        element: (
          <RequireData>
            <DashboardPage />
          </RequireData>
        ),
      },
      {
        path: '/calendar',
        element: (
          <RequireData>
            <CalendarPage />
          </RequireData>
        ),
      },
      {
        path: '/calendar/:month',
        element: (
          <RequireData>
            <CalendarPage />
          </RequireData>
        ),
      },
      {
        path: '/trades',
        element: (
          <RequireData>
            <TradesPage />
          </RequireData>
        ),
      },
      {
        path: '/trades/:tradeId',
        element: (
          <RequireData>
            <TradePage />
          </RequireData>
        ),
      },
      {
        path: '/symbols',
        element: (
          <RequireData>
            <SymbolsPage />
          </RequireData>
        ),
      },
      {
        path: '/symbols/:symbol',
        element: (
          <RequireData>
            <SymbolPage />
          </RequireData>
        ),
      },
      {
        path: '/analytics',
        element: (
          <RequireData>
            <AnalyticsPage />
          </RequireData>
        ),
      },
      {
        path: '/fees',
        element: (
          <RequireData>
            <FeesPage />
          </RequireData>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return (
    <>
      <ThemeEffect />
      <RouterProvider router={router} />
    </>
  )
}
