import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { useAppState } from '@/app/AppState'

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const CourtsPage = lazy(() => import('@/features/courts/CourtsPage').then((module) => ({ default: module.CourtsPage })))
const SessionsPage = lazy(() => import('@/features/sessions/SessionsPage').then((module) => ({ default: module.SessionsPage })))
const PlayersPage = lazy(() => import('@/features/players/PlayersPage').then((module) => ({ default: module.PlayersPage })))
const TimeMonitoringPage = lazy(() => import('@/features/time-monitoring/TimeMonitoringPage').then((module) => ({ default: module.TimeMonitoringPage })))
const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage').then((module) => ({ default: module.PaymentsPage })))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))

function RouteLoading() {
  return <div className="route-loading" role="status"><span className="skeleton" />Loading workspace…</div>
}

export function App() {
  const { data } = useAppState()
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemDark(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const resolvedTheme = (data.settings.theme ?? 'dark') === 'system'
    ? (systemDark ? 'dark' : 'light')
    : (data.settings.theme ?? 'dark')

  return <BrowserRouter>
    <Suspense fallback={<RouteLoading />}>
      <Routes><Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="courts" element={<CourtsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="time-monitoring" element={<TimeMonitoringPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route></Routes>
    </Suspense>
    <Toaster position="bottom-right" closeButton duration={3500} theme={resolvedTheme} />
  </BrowserRouter>
}
