import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfDay, startOfWeek, subDays, subWeeks } from 'date-fns'
import { ArrowRight, CalendarDays, CircleDollarSign, Clock3, Users, WalletCards } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAppState } from '@/app/AppState'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { buildCollectionSummary } from '@/domain/calculations'
import { formatCurrency, formatDate, formatTime } from '@/lib/format'

type ChartRange = 'daily' | 'weekly'

export function DashboardPage() {
  const { data } = useAppState()
  const [chartRange, setChartRange] = useState<ChartRange>('daily')
  const now = useMemo(() => new Date(), [data])
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
  const chartColors = resolvedTheme === 'light'
    ? { grid: '#d8e0e6', tick: '#64748b', cursor: 'rgba(14, 116, 144, 0.08)', bar: '#0e7490', tooltipBg: '#ffffff' }
    : { grid: '#293438', tick: '#94a3b8', cursor: 'rgba(0, 184, 196, 0.08)', bar: '#00b8c4', tooltipBg: '#111719' }

  const sessionSummaries = useMemo(() => data.sessions.map((session) => {
    const links = data.sessionPlayers.filter((item) => item.sessionId === session.id)
    const ids = new Set(links.map((item) => item.id))
    return {
      session,
      players: links,
      summary: buildCollectionSummary(
        session,
        links,
        data.timeLogs.filter((item) => ids.has(item.sessionPlayerId)),
        data.payments.filter((item) => ids.has(item.sessionPlayerId)),
        now,
      ),
    }
  }), [data, now])

  const activeSessions = sessionSummaries.filter(({ session }) => session.status === 'active')
  const totalCollectedCents = sessionSummaries.reduce((sum, item) => sum + item.summary.totalCollectedCents, 0)
  const outstandingCents = sessionSummaries
    .filter(({ session }) => session.status !== 'cancelled')
    .reduce((sum, item) => sum + item.summary.outstandingBalanceCents, 0)
  const recentSessions = [...sessionSummaries]
    .sort((a, b) => `${b.session.sessionDate}T${b.session.startTime}`.localeCompare(`${a.session.sessionDate}T${a.session.startTime}`))
    .slice(0, 6)

  const chartData = useMemo(() => {
    if (chartRange === 'daily') {
      const today = startOfDay(new Date())
      const buckets = Array.from({ length: 7 }, (_, index) => {
        const date = subDays(today, 6 - index)
        return { key: format(date, 'yyyy-MM-dd'), label: format(date, 'EEE d'), amount: 0 }
      })
      const byDate = new Map(buckets.map((bucket) => [bucket.key, bucket]))
      for (const payment of data.payments) {
        const paidAt = new Date(payment.paymentDate)
        if (!Number.isNaN(paidAt.getTime())) {
          const bucket = byDate.get(format(paidAt, 'yyyy-MM-dd'))
          if (bucket) bucket.amount += payment.amountCents
        }
      }
      return buckets
    }

    const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 })
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = subWeeks(thisWeek, 6 - index)
      return { key: format(date, 'yyyy-MM-dd'), label: format(date, 'MMM d'), amount: 0 }
    })
    const byWeek = new Map(buckets.map((bucket) => [bucket.key, bucket]))
    for (const payment of data.payments) {
      const paidAt = new Date(payment.paymentDate)
      if (!Number.isNaN(paidAt.getTime())) {
        const bucket = byWeek.get(format(startOfWeek(paidAt, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
        if (bucket) bucket.amount += payment.amountCents
      }
    }
    return buckets
  }, [chartRange, data.payments])

  const activeSummary = activeSessions.reduce((sum, item) => ({
    players: sum.players + item.players.length,
    rent: sum.rent + item.summary.totalRentalCents,
    collected: sum.collected + item.summary.totalCollectedCents,
  }), { players: 0, rent: 0, collected: 0 })

  const stats = [
    { label: 'Total court sessions', value: data.sessions.length.toLocaleString(), note: 'All recorded sessions', icon: CalendarDays },
    { label: 'Active sessions', value: activeSessions.length.toLocaleString(), note: 'Currently in progress', icon: Clock3 },
    { label: 'Registered players', value: data.players.length.toLocaleString(), note: 'Unique player records', icon: Users },
    { label: 'Total collections', value: formatCurrency(totalCollectedCents), note: 'Payments recorded to date', icon: CircleDollarSign },
    { label: 'Outstanding balances', value: formatCurrency(outstandingCents), note: 'Across open, non-cancelled sessions', icon: WalletCards },
    { label: 'Completed sessions', value: data.sessions.filter((session) => session.status === 'completed').length.toLocaleString(), note: 'Awaiting or past closeout', icon: CalendarDays },
  ]

  return <div className="page-content">
    <PageHeader
      title="Operations overview"
      description="A clear view of court activity, collections, and what needs attention."
      action={<>
        <Link className="button button-outline button-md" to="/reports">View reports <ArrowRight size={14} /></Link>
        <Link className="button button-primary button-md" to="/sessions">Manage sessions</Link>
      </>}
    />

    <section className="stat-grid" aria-label="Operations statistics">
      {stats.map(({ label, value, note, icon: Icon }) => <Card className="stat-card" key={label}>
        <div><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-note">{note}</p></div>
        <span className="stat-icon" aria-hidden="true"><Icon size={16} /></span>
      </Card>)}
    </section>

    <div className="dashboard-grid">
      <Card>
        <CardHeader>
          <div><CardTitle>Collections</CardTitle><CardDescription>Recorded payment activity from your local records.</CardDescription></div>
          <div className="segmented" role="group" aria-label="Collections chart range">
            <button type="button" className={chartRange === 'daily' ? 'active' : ''} aria-pressed={chartRange === 'daily'} onClick={() => setChartRange('daily')}>Daily</button>
            <button type="button" className={chartRange === 'weekly' ? 'active' : ''} aria-pressed={chartRange === 'weekly'} onClick={() => setChartRange('weekly')}>Weekly</button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="chart-wrap" role="img" aria-label={`Collections by ${chartRange === 'daily' ? 'day' : 'week'}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} tickFormatter={(value: number) => `₱${Math.round(value / 100).toLocaleString()}`} width={56} />
                <Tooltip
                  cursor={{ fill: chartColors.cursor }}
                  content={({ active, payload, label }) => active && payload?.length
                    ? <div className="chart-tooltip"><strong>{label}</strong><span>{formatCurrency(Number(payload[0].value ?? 0))}</span></div>
                    : null}
                />
                <Bar dataKey="amount" name="Collections" fill={chartColors.bar} radius={[3, 3, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend"><i aria-hidden="true" /> Payments received</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Live court activity</CardTitle><CardDescription>Current sessions and their running totals.</CardDescription></div></CardHeader>
        <CardContent>
          {activeSessions.length ? <>
            <div className="session-summary" aria-label="Active session totals">
              <div className="session-summary-item"><span>Players</span><strong>{activeSummary.players}</strong></div>
              <span className="session-summary-divider" />
              <div className="session-summary-item"><span>Scheduled rent</span><strong>{formatCurrency(activeSummary.rent)}</strong></div>
              <span className="session-summary-divider" />
              <div className="session-summary-item"><span>Collected</span><strong>{formatCurrency(activeSummary.collected)}</strong></div>
            </div>
            <div className="live-panel">
              {activeSessions.map(({ session, players, summary }) => {
                const courtName = data.courts.find((court) => court.id === session.courtId)?.name ?? 'Court unavailable'
                return <div className="live-row" key={session.id}>
                  <div>
                    <div className="live-row-value" style={{ textAlign: 'left' }}>{courtName}</div>
                    <div className="row-subtle">{formatTime(session.startTime, data.settings.timeFormat)}–{formatTime(session.endTime, data.settings.timeFormat)} · {players.length} {players.length === 1 ? 'player' : 'players'}</div>
                  </div>
                  <div className="inline-actions">
                    <span className="live-row-value">{formatCurrency(summary.totalCollectedCents)}</span>
                    <Link className="inline-link" to={`/time-monitoring?session=${encodeURIComponent(session.id)}`} aria-label={`Monitor ${courtName}`}>Monitor</Link>
                  </div>
                </div>
              })}
            </div>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <Link className="button button-outline button-sm" to="/time-monitoring">Open time monitoring</Link>
              <Link className="button button-ghost button-sm" to="/payments">Payments</Link>
            </div>
          </> : <EmptyState title="No live sessions" description="When a session starts, its player count and collection progress will appear here." action={<Link className="button button-outline button-sm" to="/sessions">View sessions</Link>} />}
        </CardContent>
      </Card>
    </div>

    <div className="dashboard-lower">
      <Card>
        <CardHeader>
          <div><CardTitle>Recent sessions</CardTitle><CardDescription>Latest court bookings with current rent and player totals.</CardDescription></div>
          <Link className="button button-ghost button-sm" to="/sessions">All sessions <ArrowRight size={13} /></Link>
        </CardHeader>
        <CardContent>
          {recentSessions.length ? <div className="table-wrap"><table className="data-table">
            <thead><tr><th className="table-th">Date</th><th className="table-th">Start</th><th className="table-th">End</th><th className="table-th">Rate / hr</th><th className="table-th">Total rent</th><th className="table-th">Players</th><th className="table-th">Status</th><th className="table-th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{recentSessions.map(({ session, players, summary }) => <tr key={session.id}>
              <td className="table-td">{formatDate(session.sessionDate, data.settings)}</td>
              <td className="table-td">{formatTime(session.startTime, data.settings.timeFormat)}</td>
              <td className="table-td">{formatTime(session.endTime, data.settings.timeFormat)}</td>
              <td className="table-td">{formatCurrency(session.hourlyRateCents)}</td>
              <td className="table-td">{formatCurrency(summary.totalRentalCents)}</td>
              <td className="table-td">{players.length}</td>
              <td className="table-td"><StatusBadge status={session.status} /></td>
              <td className="table-td"><Link className="inline-link" to={`/sessions?session=${encodeURIComponent(session.id)}`}>Open</Link></td>
            </tr>)}</tbody>
          </table></div> : <EmptyState title="No sessions yet" description="Create a court session to start tracking schedules, players, and collections." action={<Link className="button button-primary button-sm" to="/sessions">Create a session</Link>} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Quick access</CardTitle><CardDescription>Go directly to an operations workspace.</CardDescription></div></CardHeader>
        <CardContent className="live-panel">
          <div className="live-row"><span className="live-row-label">Bookings and status</span><Link className="inline-link" to="/sessions">Sessions <ArrowRight size={12} /></Link></div>
          <div className="live-row"><span className="live-row-label">Player check-in and time</span><Link className="inline-link" to="/time-monitoring">Time monitoring <ArrowRight size={12} /></Link></div>
          <div className="live-row"><span className="live-row-label">Collections and balances</span><Link className="inline-link" to="/payments">Payments <ArrowRight size={12} /></Link></div>
          <div className="live-row"><span className="live-row-label">Closeout and summaries</span><Link className="inline-link" to="/reports">Reports <ArrowRight size={12} /></Link></div>
        </CardContent>
      </Card>
    </div>
  </div>
}
