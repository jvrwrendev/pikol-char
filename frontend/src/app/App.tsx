import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { useAppState } from '@/app/AppState'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CourtsPage } from '@/features/courts/CourtsPage'
import { SessionsPage } from '@/features/sessions/SessionsPage'
import { PlayersPage } from '@/features/players/PlayersPage'
import { TimeMonitoringPage } from '@/features/time-monitoring/TimeMonitoringPage'
import { PaymentsPage } from '@/features/payments/PaymentsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

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
    <Toaster position="bottom-right" closeButton duration={3500} theme={resolvedTheme} />
  </BrowserRouter>
}
