import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronDown, ChevronRight, Clock3, Pencil, Play, QrCode, Square, Users } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAppState } from '@/app/AppState'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Field'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { buildCollectionSummary, totalPlayerMinutes } from '@/domain/calculations'
import { validateTimeLog } from '@/domain/validation'
import type { CourtSession, PlayerTimeLog, SessionPlayer } from '@/domain/models'
import { useIntervalTick } from '@/hooks/useInterval'
import { formatDate, formatDateTime, formatDuration, formatTime } from '@/lib/format'

const editLogSchema = z.object({
  timeIn: z.string().min(1, 'Choose a Time In.'),
  timeOut: z.string().optional(),
})
type EditLogValues = z.infer<typeof editLogSchema>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The time record could not be saved. Please try again.'
}

function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function defaultSessionId(sessions: CourtSession[], requestedId: string | null): string {
  if (requestedId && sessions.some((session) => session.id === requestedId)) return requestedId
  const active = sessions.find((session) => session.status === 'active' && !session.finalizedAt)
  if (active) return active.id
  const today = localDateKey(new Date())
  const todayUpcoming = sessions.find((session) => session.sessionDate === today && session.status === 'scheduled' && !session.finalizedAt)
  if (todayUpcoming) return todayUpcoming.id
  const upcoming = sessions.filter((session) => session.status === 'scheduled' && !session.finalizedAt)
    .sort((left, right) => `${left.sessionDate}T${left.startTime}`.localeCompare(`${right.sessionDate}T${right.startTime}`))[0]
  return upcoming?.id ?? sessions[0]?.id ?? ''
}

function toLocalDateTimeInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localInputToISO(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time.')
  return date.toISOString()
}

function SessionSelect({ sessions, value, onChange }: {
  sessions: CourtSession[]; value: string; onChange: (value: string) => void
}) {
  return <label className="monitor-session-select">
    <span className="field-label" style={{ marginBottom: 4 }}>Court session</span>
    <select className="field-input field-select" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Select court session">
      {sessions.map((session) => <option key={session.id} value={session.id}>
        {formatDate(session.sessionDate)} · {session.startTime}–{session.endTime} · {session.status}
      </option>)}
    </select>
  </label>
}

type PlayerRow = {
  link: SessionPlayer
  name: string
  logs: PlayerTimeLog[]
  activeLog?: PlayerTimeLog
  latest?: PlayerTimeLog
  totalMinutes: number
  status: 'waiting' | 'playing' | 'finished'
}

export function TimeMonitoringPage() {
  const { data, timeIn, timeOut, editTimeLog } = useAppState()
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useIntervalTick(30_000)
  const sessions = useMemo(() => [...data.sessions].sort((a, b) => `${b.sessionDate}T${b.startTime}`.localeCompare(`${a.sessionDate}T${a.startTime}`)), [data.sessions])
  const [selectedSessionId, setSelectedSessionId] = useState(() => defaultSessionId(data.sessions, searchParams.get('session')))
  const [editingLog, setEditingLog] = useState<PlayerTimeLog | null>(null)
  const [editError, setEditError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scanOpen, setScanOpen] = useState(false)
  const [scanQuery, setScanQuery] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)

  const session = data.sessions.find((item) => item.id === selectedSessionId)
  const scheduledEnd = session ? new Date(`${session.sessionDate}T${session.endTime}:00`) : null
  const boundedNow = scheduledEnd && Number.isFinite(scheduledEnd.getTime()) && now.getTime() > scheduledEnd.getTime() ? scheduledEnd : now
  const court = session ? data.courts.find((item) => item.id === session.courtId) : undefined
  const registrations = useMemo(() => session ? data.sessionPlayers.filter((item) => item.sessionId === session.id) : [], [data.sessionPlayers, session])
  const closed = Boolean(session && (session.finalizedAt || session.status === 'cancelled' || session.status === 'completed'))
  const timeActionsEnabled = Boolean(session && session.status === 'active' && !session.finalizedAt)
  const summary = session ? buildCollectionSummary(session, registrations, data.timeLogs, data.payments, boundedNow) : null
  const activePlayers = registrations.filter((link) => data.timeLogs.some((log) => log.sessionPlayerId === link.id && !log.timeOut)).length
  const form = useForm<EditLogValues>({ resolver: zodResolver(editLogSchema), defaultValues: { timeIn: '', timeOut: '' } })

  useEffect(() => {
    if (!selectedSessionId || !sessions.some((item) => item.id === selectedSessionId)) {
      const next = defaultSessionId(sessions, searchParams.get('session'))
      setSelectedSessionId(next)
      if (next) setSearchParams((params) => { params.set('session', next); return params }, { replace: true })
    }
  }, [searchParams, selectedSessionId, sessions, setSearchParams])

  useEffect(() => {
    if (editingLog) {
      form.reset({ timeIn: toLocalDateTimeInput(editingLog.timeIn), timeOut: toLocalDateTimeInput(editingLog.timeOut) })
      setEditError('')
    }
  }, [editingLog, form])

  const rows: PlayerRow[] = useMemo(() => registrations.map((link) => {
    const player = data.players.find((item) => item.id === link.playerId)
    const logs = data.timeLogs.filter((log) => log.sessionPlayerId === link.id).sort((a, b) => a.timeIn.localeCompare(b.timeIn))
    const activeLog = logs.find((log) => !log.timeOut)
    const latest = logs[logs.length - 1]
    const status: PlayerRow['status'] = activeLog ? 'playing' : logs.length ? 'finished' : 'waiting'
    return {
      link,
      name: player?.name ?? 'Unknown player',
      logs,
      activeLog,
      latest,
      totalMinutes: totalPlayerMinutes(link.id, data.timeLogs, boundedNow),
      status,
    }
  }).sort((a, b) => a.name.localeCompare(b.name)), [boundedNow, data.players, data.timeLogs, registrations])

  function chooseSession(id: string) {
    setSelectedSessionId(id)
    setSearchParams((params) => { params.set('session', id); return params }, { replace: true })
  }

  function registerTimeIn(sessionPlayerId: string) {
    try {
      timeIn(sessionPlayerId)
      toast.success('Time In recorded.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function registerTimeOut(sessionPlayerId: string) {
    try {
      timeOut(sessionPlayerId)
      toast.success('Time Out recorded.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function submitEdit(values: EditLogValues) {
    if (!editingLog || !session || session.finalizedAt) {
      setEditError('Time records cannot be edited after this session is finalized.')
      return
    }
    try {
      const candidate = {
        ...editingLog,
        timeIn: localInputToISO(values.timeIn),
        timeOut: values.timeOut ? localInputToISO(values.timeOut) : null,
      }
      const otherLogs = data.timeLogs.filter((log) => log.sessionPlayerId === editingLog.sessionPlayerId)
      const validationError = validateTimeLog(candidate, session, otherLogs, editingLog.id)
      if (validationError) {
        setEditError(validationError)
        return
      }
      editTimeLog(editingLog.id, candidate.timeIn, candidate.timeOut)
      toast.success('Time interval corrected.')
      setEditingLog(null)
      setEditError('')
    } catch (error) {
      setEditError(errorMessage(error))
    }
  }

  function toggleExpand(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopScan() {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current)
    scanTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  useEffect(() => () => stopScan(), [])

  useEffect(() => {
    if (!scanOpen) stopScan()
  }, [scanOpen])

  function handleScanResult(value: string) {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return
    const match = rows.find((row) => row.link.id.toLowerCase() === normalized
      || row.link.playerId.toLowerCase() === normalized
      || row.name.toLowerCase() === normalized)
    if (!match) {
      setScanMessage(`Scanned code "${value}" did not match a registered player in this session.`)
      return
    }
    setScanMessage(`Matched ${match.name}.`)
    if (match.activeLog) registerTimeOut(match.link.id)
    else registerTimeIn(match.link.id)
    setScanOpen(false)
    setScanQuery('')
  }

  async function startCameraScan() {
    setScanMessage('')
    const Detector = (window as Window & { BarcodeDetector?: new (init?: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setScanMessage('Camera QR scanning is not supported in this browser. Use player selection below for admin-controlled Time In/Time Out.')
      return
    }
    try {
      stopScan()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const detector = new Detector({ formats: ['qr_code'] })
      setScanning(true)
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return
        try {
          const codes = await detector.detect(videoRef.current)
          const raw = codes.find((code) => code.rawValue)?.rawValue
          if (raw) handleScanResult(raw)
        } catch {
          // ignore intermittent detection errors
        }
      }, 500)
    } catch {
      setScanMessage('Camera access was unavailable. Use player selection below for admin-controlled Time In/Time Out.')
      stopScan()
    }
  }

  const scanRows = useMemo(() => {
    const query = scanQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.name.toLowerCase().includes(query))
  }, [rows, scanQuery])

  return <div className="page-content">
    <PageHeader
      title="Time monitoring"
      description="Track player intervals in real time with a compact, session-focused view."
      action={<div className="monitor-header-actions">
        <Button variant="outline" onClick={() => { setScanOpen(true); setScanQuery(''); setScanMessage('') }} disabled={!session || registrations.length === 0}>
          <QrCode size={15} /> Scan Player QR Code
        </Button>
        {sessions.length > 0 ? <SessionSelect sessions={sessions} value={selectedSessionId} onChange={chooseSession} /> : null}
      </div>}
    />

    {!sessions.length ? <Card><CardContent><EmptyState title="No court sessions yet" description="Create a court session before tracking player time." /></CardContent></Card> : session ? <>
      <div className="monitor-overview" aria-label="Selected session overview">
        <div className="monitor-overview-item"><span>Session</span><strong>{court?.name ?? 'Court'}</strong><small>{formatDate(session.sessionDate, data.settings)} · {formatTime(session.startTime, data.settings.timeFormat)}–{formatTime(session.endTime, data.settings.timeFormat)}</small></div>
        <div className="monitor-overview-item"><span>State</span><strong className="monitor-badge-wrap"><StatusBadge status={session.status} /></strong><small>{session.finalizedAt ? 'Finalized and locked' : (session.status === 'active' ? 'Ready for time actions' : 'Set session to Active to track time')}</small></div>
        <div className="monitor-overview-item"><span>Players</span><strong>{activePlayers} playing / {registrations.length} total</strong><small>{registrations.length ? 'Registered in this session' : 'No players registered'}</small></div>
        <div className="monitor-overview-item"><span>Session time</span><strong>{formatDuration(summary?.totalPlayerMinutes ?? 0)}</strong><small>Total player-minutes (live)</small></div>
      </div>

      {!timeActionsEnabled && <div className="helper-note" role="status" style={{ marginBottom: 14 }}>
        <Clock3 size={16} />
        <span>{closed ? 'This session is closed. Time actions are unavailable.' : 'Time actions become available when the session is Active.'}{session.finalizedAt ? ' Finalized records are locked.' : ''}</span>
      </div>}

      <Card>
        <CardHeader>
          <div><CardTitle>Player monitoring</CardTitle><p className="card-description">Unified time tracking with per-player interval details. Actions are enabled only while this session is active and not finalized.</p></div>
          <Link className="inline-link" to={`/players?session=${encodeURIComponent(session.id)}`}><Users size={14} /> Manage players</Link>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <EmptyState title="No players registered" description="Register players before tracking their time." action={<Link className="button button-outline button-sm" to={`/players?session=${encodeURIComponent(session.id)}`}>Go to player registrations</Link>} /> : <div className="table-wrap monitor-table-wrap">
            <table className="data-table monitor-table" aria-label="Player monitoring table">
              <thead><tr>
                <th className="table-th monitor-expand-col" aria-label="Expand intervals" />
                <th className="table-th">Player Name</th>
                <th className="table-th">Status</th>
                <th className="table-th">Time In</th>
                <th className="table-th">Time Out</th>
                <th className="table-th">Total Hours</th>
                <th className="table-th">Actions</th>
              </tr></thead>
              <tbody>{rows.map((row) => {
                const isExpanded = expanded.has(row.link.id)
                return <Fragment key={row.link.id}>
                  <tr className={row.status === 'playing' ? 'row-highlight' : undefined}>
                    <td className="table-td monitor-expand-col">
                      <button type="button" className="icon-button monitor-expand-btn" aria-label={`${isExpanded ? 'Hide' : 'View'} intervals for ${row.name}`} aria-expanded={isExpanded} onClick={() => toggleExpand(row.link.id)} disabled={row.logs.length === 0}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="table-td"><span className="table-primary">{row.name}</span><span className="table-secondary">{row.logs.length} interval{row.logs.length === 1 ? '' : 's'}</span></td>
                    <td className="table-td"><StatusBadge status={row.status} /></td>
                    <td className="table-td">{row.latest ? formatDateTime(row.latest.timeIn, data.settings) : <span className="row-subtle">—</span>}</td>
                    <td className="table-td">{row.latest?.timeOut ? formatDateTime(row.latest.timeOut, data.settings) : row.activeLog ? <span className="time-running">Playing now</span> : <span className="row-subtle">—</span>}</td>
                    <td className="table-td"><strong className="table-primary">{formatDuration(row.totalMinutes)}</strong></td>
                    <td className="table-td">
                      <div className="table-actions">
                        {row.activeLog
                          ? <Button size="sm" variant="danger" aria-label={`Time Out ${row.name}`} disabled={!timeActionsEnabled} onClick={() => registerTimeOut(row.link.id)}><Square size={13} /> Time Out</Button>
                          : <Button size="sm" variant="primary" aria-label={`Time In ${row.name}`} disabled={!timeActionsEnabled} onClick={() => registerTimeIn(row.link.id)}><Play size={13} /> Time In</Button>}
                        <Button size="sm" variant="ghost" aria-label={`View intervals for ${row.name}`} onClick={() => toggleExpand(row.link.id)} disabled={row.logs.length === 0}>Intervals</Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && row.logs.length > 0 && <tr className="monitor-interval-row">
                    <td className="table-td" colSpan={7}>
                      <div className="monitor-interval-panel">
                        <div className="monitor-interval-head"><strong>Playing intervals — {row.name}</strong><span className="row-subtle">Edit individual intervals for corrections (when session is not finalized).</span></div>
                        <div className="table-wrap">
                          <table className="data-table monitor-subtable" aria-label={`${row.name} time intervals`}>
                            <thead><tr><th className="table-th">#</th><th className="table-th">Time In</th><th className="table-th">Time Out</th><th className="table-th">Duration</th><th className="table-th">Action</th></tr></thead>
                            <tbody>{row.logs.map((log, index) => <tr key={log.id}>
                              <td className="table-td">{index + 1}</td>
                              <td className="table-td">{formatDateTime(log.timeIn, data.settings)}</td>
                              <td className="table-td">{log.timeOut ? formatDateTime(log.timeOut, data.settings) : <span className="time-running">Playing now</span>}</td>
                              <td className="table-td">{formatDuration(log.timeOut ? log.durationMinutes : totalPlayerMinutes(row.link.id, [log], boundedNow))}</td>
                              <td className="table-td">{!session.finalizedAt ? <Button size="sm" variant="outline" aria-label={`Edit interval ${index + 1} for ${row.name}`} onClick={() => setEditingLog(log)}><Pencil size={13} /> Edit</Button> : <span className="row-subtle">Locked</span>}</td>
                            </tr>)}</tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>}
                </Fragment>
              })}</tbody>
            </table>
          </div>}
        </CardContent>
      </Card>

      <div className="page-heading-action" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <Link className="inline-link" to={`/payments?session=${encodeURIComponent(session.id)}`}>View session payments</Link>
      </div>
    </> : <Card><CardContent><EmptyState title="Select a session" description="Choose a court session to view player time." /></CardContent></Card>}

    <Dialog open={scanOpen} onOpenChange={(open) => { setScanOpen(open); if (!open) { stopScan(); setScanQuery(''); setScanMessage('') } }}>
      <DialogContent className="monitor-scan-dialog">
        <DialogHeader>
          <DialogTitle>Scan Player QR Code</DialogTitle>
          <DialogDescription>Scan a player QR code or select a registered player for admin-controlled Time In/Time Out in this session.</DialogDescription>
        </DialogHeader>
        <div className="monitor-scan-body">
          <div className="monitor-scan-actions">
            <Button variant="outline" onClick={() => { void startCameraScan() }} disabled={!timeActionsEnabled || scanning}><QrCode size={15} /> {scanning ? 'Scanning…' : 'Start camera scan'}</Button>
            {scanning && <Button variant="ghost" onClick={stopScan}>Stop scan</Button>}
          </div>
          <video ref={videoRef} className="monitor-scan-video" muted playsInline style={{ display: scanning ? 'block' : 'none' }} aria-label="Camera preview for QR scanning" />
          {scanMessage && <p className="helper-note" role="status">{scanMessage}</p>}
          {!timeActionsEnabled && <p className="field-error" role="alert">Time actions are available only when the session is Active and not finalized.</p>}
          <div className="form-field" style={{ marginTop: 8 }}>
            <label className="field-label" htmlFor="scan-player-search">Find player</label>
            <Input id="scan-player-search" value={scanQuery} onChange={(event) => setScanQuery(event.target.value)} placeholder="Search registered player name" />
          </div>
          <div className="monitor-scan-list" role="list" aria-label="Registered players for scan selection">
            {scanRows.length === 0 ? <p className="row-subtle">No matching players.</p> : scanRows.map((row) => <div key={row.link.id} className="monitor-scan-item" role="listitem">
              <div className="monitor-scan-item-main">
                <span className="table-primary">{row.name}</span>
                <span className="table-secondary">{row.activeLog ? 'Currently playing' : row.logs.length ? 'Finished / waiting to resume' : 'Waiting'}</span>
              </div>
              <div className="inline-actions">
                <StatusBadge status={row.status} />
                {row.activeLog
                  ? <Button size="sm" variant="danger" aria-label={`Time Out ${row.name}`} disabled={!timeActionsEnabled} onClick={() => { registerTimeOut(row.link.id); setScanOpen(false) }}><Square size={13} /> Time Out</Button>
                  : <Button size="sm" variant="primary" aria-label={`Time In ${row.name}`} disabled={!timeActionsEnabled} onClick={() => { registerTimeIn(row.link.id); setScanOpen(false) }}><Play size={13} /> Time In</Button>}
              </div>
            </div>)}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setScanOpen(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(editingLog)} onOpenChange={(open) => { if (!open) { setEditingLog(null); setEditError('') } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Correct time interval</DialogTitle><DialogDescription>Times are shown in your local timezone. Corrections must remain inside the session and cannot overlap another interval for this player.</DialogDescription></DialogHeader>
        <form onSubmit={form.handleSubmit(submitEdit)}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label" htmlFor="time-in-edit">Time In</label><input className="field-input" id="time-in-edit" type="datetime-local" step="60" {...form.register('timeIn')} aria-invalid={Boolean(form.formState.errors.timeIn)} />{form.formState.errors.timeIn && <span className="field-error" role="alert">{form.formState.errors.timeIn.message}</span>}</div>
            <div className="form-field"><label className="field-label" htmlFor="time-out-edit">Time Out <span className="muted-copy">(leave blank if still playing)</span></label><input className="field-input" id="time-out-edit" type="datetime-local" step="60" {...form.register('timeOut')} aria-invalid={Boolean(form.formState.errors.timeOut)} />{form.formState.errors.timeOut && <span className="field-error" role="alert">{form.formState.errors.timeOut.message}</span>}</div>
          </div>
          {editError && <p className="field-error" role="alert">{editError}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setEditingLog(null); setEditError('') }}>Cancel</Button><Button type="submit" disabled={form.formState.isSubmitting}><Check size={14} /> Save correction</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
