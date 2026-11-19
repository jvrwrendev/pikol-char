import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
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
  return <BrowserRouter><Suspense fallback={<RouteLoading />}><Routes><Route element={<AppShell />}>
    <Route index element={<DashboardPage />} />
    <Route path="sessions" element={<SessionsPage />} />
    <Route path="players" element={<PlayersPage />} />
    <Route path="time-monitoring" element={<TimeMonitoringPage />} />
    <Route path="payments" element={<PaymentsPage />} />
    <Route path="reports" element={<ReportsPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></Suspense></BrowserRouter>
}
