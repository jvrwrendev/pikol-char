import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Printer } from 'lucide-react'
import { buildCollectionSummary, intervalDurationMinutes, liquidationStatus, sessionDurationMinutes, totalPlayerMinutes } from '@/domain/calculations'
import { formatCurrency, formatDate, formatDuration, formatHours, formatTime } from '@/lib/format'
import { useAppState } from '@/app/AppState'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Input, Label, Select } from '@/components/ui/Field'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'

function clockFromIso(value: string | null, timeFormat: '12h' | '24h'): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const localTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return formatTime(localTime, timeFormat)
}

export function ReportsPage() {
  const { data } = useAppState()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sessionId, setSessionId] = useState('')
  const history = useMemo(() => data.sessions
    .filter((session) => (session.status === 'completed' || Boolean(session.finalizedAt)) && session.status !== 'cancelled')
    .filter((session) => (!dateFrom || session.sessionDate >= dateFrom) && (!dateTo || session.sessionDate <= dateTo))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.startTime.localeCompare(a.startTime)), [data.sessions, dateFrom, dateTo])
  const selectedSession = history.find((session) => session.id === sessionId) ?? history[0]
  const court = selectedSession ? data.courts.find((item) => item.id === selectedSession.courtId) : undefined
  const sessionPlayers = selectedSession ? data.sessionPlayers.filter((player) => player.sessionId === selectedSession.id) : []
  const sessionPlayerIds = new Set(sessionPlayers.map((player) => player.id))
  const logs = data.timeLogs.filter((log) => sessionPlayerIds.has(log.sessionPlayerId))
  const payments = data.payments.filter((payment) => sessionPlayerIds.has(payment.sessionPlayerId))
  const summary = selectedSession ? buildCollectionSummary(selectedSession, sessionPlayers, logs, payments) : null
  const playerById = new Map(data.players.map((player) => [player.id, player]))
  const financeById = new Map(summary?.players.map((finance) => [finance.sessionPlayerId, finance]) ?? [])
  const storedReport = selectedSession ? data.reports.find((report) => report.sessionId === selectedSession.id) : undefined
  const reportStatus = storedReport?.status ?? (summary ? liquidationStatus(summary.totalCollectedCents, summary.totalRentalCents) : 'pending_collection')

  const playerRows = sessionPlayers.map((link) => {
    const playerLogs = logs.filter((log) => log.sessionPlayerId === link.id).sort((a, b) => a.timeIn.localeCompare(b.timeIn))
    const first = playerLogs[0]
    const last = playerLogs[playerLogs.length - 1]
    const finance = financeById.get(link.id)
    const eachInterval = playerLogs.length
      ? playerLogs.map((log) => `${clockFromIso(log.timeIn, data.settings.timeFormat)}–${log.timeOut ? clockFromIso(log.timeOut, data.settings.timeFormat) : 'In progress'}`).join(', ')
      : '—'
    return {
      id: link.id,
      name: playerById.get(link.playerId)?.name ?? 'Unknown player',
      intervals: eachInterval,
      firstIn: clockFromIso(first?.timeIn ?? null, data.settings.timeFormat),
      lastOut: clockFromIso(last?.timeOut ?? null, data.settings.timeFormat),
      minutes: totalPlayerMinutes(link.id, logs),
      due: finance?.amountDueCents ?? 0,
      paid: finance?.amountPaidCents ?? 0,
      balance: finance?.remainingBalanceCents ?? 0,
      status: finance?.paymentStatus ?? 'not_charged',
    }
  })
  const durationMinutes = selectedSession ? sessionDurationMinutes(selectedSession.startTime, selectedSession.endTime) : 0

  const downloadPdf = async () => {
    if (!selectedSession || !summary) return
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const statusText = reportStatus === 'fully_liquidated'
      ? 'Fully Liquidated'
      : `Pending Collection · Outstanding ${formatCurrency(summary.totalRentalCents - summary.totalCollectedCents)}`
    doc.setFontSize(16)
    doc.text(`${data.settings.systemName} — Liquidation Report`, 14, 17)
    doc.setFontSize(10)
    doc.text(`Session date: ${formatDate(selectedSession.sessionDate, data.settings)}    Court: ${court?.name ?? 'Unknown court'}`, 14, 25)
    doc.text(`Schedule: ${formatTime(selectedSession.startTime, data.settings.timeFormat)}–${formatTime(selectedSession.endTime, data.settings.timeFormat)}    Duration: ${formatDuration(durationMinutes)}    Rate: ${formatCurrency(selectedSession.hourlyRateCents)}/hr`, 14, 31)
    doc.text(`Registered players: ${sessionPlayers.length}    Total player-hours: ${formatHours(summary.totalPlayerMinutes)}    Shared hourly rate: ${formatCurrency(summary.sharedHourlyRateCents)}/hr`, 14, 37)
    doc.text(`Court rent: ${formatCurrency(summary.totalRentalCents)}    Amount due: ${formatCurrency(summary.totalAmountDueCents)}    Collected: ${formatCurrency(summary.totalCollectedCents)}    ${statusText}`, 14, 43)
    const body = playerRows.map((row) => [
      row.name, row.intervals, row.firstIn, row.lastOut, formatHours(row.minutes), formatCurrency(row.due), formatCurrency(row.paid), formatCurrency(row.balance), row.status.replaceAll('_', ' '),
    ])
    autoTable(doc, {
      startY: 49,
      head: [['Player', 'Each time in/out', 'First in', 'Last out', 'Hours', 'Charge', 'Paid', 'Balance', 'Status']],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 1: { cellWidth: 54 } },
    })
    doc.save(`liquidation-${selectedSession.sessionDate}-${selectedSession.id}.pdf`)
  }

  return <div className="page-content">
    <PageHeader title="Reports" description="Review and export historical session liquidation." action={<div className="report-actions inline-actions">
      <Button variant="outline" onClick={() => window.print()} disabled={!selectedSession}><Printer size={15} />Print report</Button>
      <Button onClick={() => { void downloadPdf().catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'PDF export failed.')) }} disabled={!selectedSession}><Download size={15} />Download PDF</Button>
    </div>} />
    <div className="toolbar">
      <div className="toolbar-left">
        <Label htmlFor="reports-from" className="filter-label">From</Label><Input id="reports-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Filter sessions from date" />
        <Label htmlFor="reports-to" className="filter-label">To</Label><Input id="reports-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Filter sessions through date" />
        <Label htmlFor="report-session" className="filter-label">Historical session</Label>
        <Select id="report-session" value={selectedSession?.id ?? ''} onChange={(event) => setSessionId(event.target.value)}>
          {history.map((session) => <option key={session.id} value={session.id}>{formatDate(session.sessionDate, data.settings)} · {data.courts.find((item) => item.id === session.courtId)?.name ?? 'Court'} · {session.startTime}–{session.endTime}</option>)}
        </Select>
      </div>
    </div>

    {!selectedSession || !summary ? <Card><CardContent><EmptyState title={history.length ? 'Choose a session' : 'No historical sessions found'} description={history.length ? 'Select a completed session to view its liquidation.' : 'Adjust the date range or complete a session before creating a liquidation report.'} /></CardContent></Card> : <Card>
      <CardContent className="report-sheet">
        <div className="report-top">
          <div><div className="report-brand"><span className="report-brand-mark" aria-hidden="true" /><strong>{data.settings.systemName}</strong></div><h2 className="report-title">Session Liquidation</h2><p className="report-subtitle">Prepared from this browser’s session and payment records</p></div>
          <StatusBadge status={reportStatus} />
        </div>
        <section className="report-section">
          <h3>Session details</h3>
          <div className="report-meta-grid">
            <div className="report-meta-item"><span>Session date</span><strong>{formatDate(selectedSession.sessionDate, data.settings)}</strong></div>
            <div className="report-meta-item"><span>Court</span><strong>{court?.name ?? 'Unknown court'}</strong></div>
            <div className="report-meta-item"><span>Hourly rate</span><strong>{formatCurrency(selectedSession.hourlyRateCents)} / hour</strong></div>
            <div className="report-meta-item"><span>Schedule</span><strong>{formatTime(selectedSession.startTime, data.settings.timeFormat)}–{formatTime(selectedSession.endTime, data.settings.timeFormat)}</strong></div>
            <div className="report-meta-item"><span>Duration</span><strong>{formatDuration(durationMinutes)}</strong></div>
            <div className="report-meta-item"><span>Registered players</span><strong>{sessionPlayers.length}</strong></div>
            <div className="report-meta-item"><span>Total player-hours</span><strong>{formatHours(summary.totalPlayerMinutes)}</strong></div>
            <div className="report-meta-item"><span>Shared hourly rate</span><strong>{formatCurrency(summary.sharedHourlyRateCents)} / hour</strong></div>
          </div>
        </section>
        <section className="report-section">
          <h3>Liquidation summary</h3>
          <div className="report-meta-grid">
            <div className="report-meta-item"><span>Rent</span><strong>{formatCurrency(summary.totalRentalCents)}</strong></div>
            <div className="report-meta-item"><span>Amount due</span><strong>{formatCurrency(summary.totalAmountDueCents)}</strong></div>
            <div className="report-meta-item"><span>Total collected</span><strong>{formatCurrency(summary.totalCollectedCents)}</strong></div>
            <div className="report-meta-item report-total"><span>{reportStatus === 'fully_liquidated' ? 'Liquidation status' : 'Outstanding balance'}</span><strong>{reportStatus === 'fully_liquidated' ? 'Fully Liquidated' : formatCurrency(summary.totalRentalCents - summary.totalCollectedCents)}</strong></div>
          </div>
          {reportStatus === 'pending_collection' && <p className="muted-copy">Pending Collection · outstanding balance {formatCurrency(summary.totalRentalCents - summary.totalCollectedCents)}</p>}
        </section>
        <section className="report-section">
          <h3>Player breakdown</h3>
          {playerRows.length === 0 ? <EmptyState title="No registered players" description="No player allocations are available for this session." /> : <TableWrap>
            <Table>
              <thead><tr><Th>Player</Th><Th>Each time in / out</Th><Th>First in</Th><Th>Last out</Th><Th>Total hours</Th><Th>Charge</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
              <tbody>{playerRows.map((row) => <tr key={row.id}>
                <Td><span className="table-primary">{row.name}</span></Td><Td>{row.intervals}</Td><Td>{row.firstIn}</Td><Td>{row.lastOut}</Td><Td>{formatHours(row.minutes)}</Td>
                <Td>{formatCurrency(row.due)}</Td><Td>{formatCurrency(row.paid)}</Td><Td className={row.balance < 0 ? 'balance-negative' : undefined}>{formatCurrency(row.balance)}{row.balance < 0 ? ' · Credit' : ''}</Td><Td><StatusBadge status={row.status} /></Td>
              </tr>)}</tbody>
            </Table>
          </TableWrap>}
        </section>
        <p className="report-subtitle" style={{ marginTop: 18 }}>Session duration: {formatDuration(durationMinutes)} · Total player minutes calculated from individual time logs ({logs.reduce((sum, log) => sum + intervalDurationMinutes(log.timeIn, log.timeOut), 0)} logged minutes).</p>
      </CardContent>
    </Card>}
  </div>
}
