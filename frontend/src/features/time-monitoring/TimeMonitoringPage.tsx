import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronDown, ChevronRight, Clock3, Pencil, Play, QrCode, Square, UserPlus } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { formatCurrency, formatDate, formatDateTime, formatDuration, formatTime } from '@/lib/format'

const editLogSchema = z.object({
  timeIn: z.string().min(1, 'Choose a Time In.'),
  timeOut: z.string().optional(),
})
type EditLogValues = z.infer<typeof editLogSchema>

type PendingScan = {
  playerId: string
  playerName: string
  sessionPlayerId?: string
  action: 'time_in' | 'time_out'
  willRegister: boolean
  source: 'qr' | 'manual'
}

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

function parsePlayerIdFromQr(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const match = /^pikol-char:player:(.+)$/i.exec(value)
  return (match?.[1] ?? value).trim() || null
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
  notes: string
  logs: PlayerTimeLog[]
  activeLog?: PlayerTimeLog
  latest?: PlayerTimeLog
  totalMinutes: number
  status: 'waiting' | 'playing' | 'finished'
  checkedIn: boolean
  amountPaidCents: number
  amountDueCents: number
  remainingBalanceCents: number
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'not_charged'
}

export function TimeMonitoringPage() {
  const { data, confirmPlayerScan, editTimeLog, editPlayer } = useAppState()
  const navigate = useNavigate()
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
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null)
  const [confirmingScan, setConfirmingScan] = useState(false)
  const [notesTarget, setNotesTarget] = useState<{ sessionPlayerId: string; playerId: string; playerName: string; contactNumber: string; notes: string } | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
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
  const financeByPlayer = useMemo(() => new Map(summary?.players.map((finance) => [finance.sessionPlayerId, finance]) ?? []), [summary])
  const totalRentalCents = summary?.totalRentalCents ?? 0
  const totalCollectedCents = summary?.totalCollectedCents ?? 0
  const remainingVsRentalCents = Math.max(totalRentalCents - totalCollectedCents, 0)
  const overVsRentalCents = Math.max(totalCollectedCents - totalRentalCents, 0)
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
    const checkedIn = logs.length > 0
    const status: PlayerRow['status'] = activeLog ? 'playing' : checkedIn ? 'finished' : 'waiting'
    const finance = financeByPlayer.get(link.id)
    return {
      link,
      name: player?.name ?? 'Unknown player',
      notes: link.notes ?? '',
      logs,
      activeLog,
      latest,
      totalMinutes: totalPlayerMinutes(link.id, data.timeLogs, boundedNow),
      status,
      checkedIn,
      amountPaidCents: finance?.amountPaidCents ?? 0,
      amountDueCents: finance?.amountDueCents ?? 0,
      remainingBalanceCents: finance?.remainingBalanceCents ?? 0,
      paymentStatus: finance?.paymentStatus ?? 'not_charged',
    }
  }).sort((a, b) => a.name.localeCompare(b.name)), [boundedNow, data.players, data.timeLogs, financeByPlayer, registrations])

  const currentlyPlayingCount = rows.filter((row) => Boolean(row.activeLog)).length
  const checkedInCount = rows.filter((row) => row.checkedIn).length
  const finishedPlayersCount = Math.max(0, checkedInCount - currentlyPlayingCount)

  function chooseSession(id: string) {
    setSelectedSessionId(id)
    setSearchParams((params) => { params.set('session', id); return params }, { replace: true })
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

  function openNotes(row: PlayerRow) {
    const player = data.players.find((item) => item.id === row.link.playerId)
    setNotesTarget({
      sessionPlayerId: row.link.id,
      playerId: row.link.playerId,
      playerName: row.name,
      contactNumber: player?.contactNumber ?? '',
      notes: row.notes ?? '',
    })
    setNotesDraft(row.notes ?? '')
  }

  async function saveNotes() {
    if (!notesTarget) return
    setSavingNotes(true)
    try {
      editPlayer(notesTarget.sessionPlayerId, {
        name: notesTarget.playerName,
        contactNumber: notesTarget.contactNumber,
        notes: notesDraft,
      })
      toast.success(notesDraft.trim() ? 'Notes saved.' : 'Notes cleared.')
      setNotesTarget(null)
      setNotesDraft('')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSavingNotes(false)
    }
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
    if (!scanOpen) {
      stopScan()
      setPendingScan(null)
      setScanQuery('')
      setScanMessage('')
    }
  }, [scanOpen])

  function prepareScan(playerId: string, source: 'qr' | 'manual') {
    if (!session) {
      setScanMessage('Select a session before scanning players.')
      setScanOpen(true)
      return
    }
    if (!timeActionsEnabled) {
      setScanMessage('QR/time actions are available only when the session is Active and not finalized.')
      setPendingScan(null)
      setScanOpen(true)
      return
    }
    const player = data.players.find((item) => item.id === playerId)
    if (!player) {
      setScanMessage(source === 'qr' ? 'Scanned QR code did not match a known player.' : 'Player not found.')
      setPendingScan(null)
      setScanOpen(true)
      return
    }
    const link = registrations.find((item) => item.playerId === playerId)
    const activeLog = link ? data.timeLogs.some((log) => log.sessionPlayerId === link.id && !log.timeOut) : false
    const action: 'time_in' | 'time_out' = activeLog ? 'time_out' : 'time_in'
    setPendingScan({
      playerId: player.id,
      playerName: player.name,
      sessionPlayerId: link?.id,
      action,
      willRegister: !link,
      source,
    })
    setScanMessage(source === 'qr'
      ? `QR matched ${player.name}. Confirm the ${action === 'time_in' ? 'Time In' : 'Time Out'} action below.`
      : `${player.name} selected. Confirm the ${action === 'time_in' ? 'Time In' : 'Time Out'} action below.`)
    setScanOpen(true)
  }

  function handleScanResult(value: string) {
    const playerId = parsePlayerIdFromQr(value)
    if (!playerId) {
      setScanMessage('Scanned code is empty or invalid.')
      return
    }
    prepareScan(playerId, 'qr')
  }

  async function startCameraScan() {
    setScanMessage('')
    setPendingScan(null)
    const Detector = (window as Window & { BarcodeDetector?: new (init?: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setScanMessage('Camera QR scanning is not supported in this browser. Select a player below for admin-confirmed check-in/check-out.')
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
          if (raw) {
            stopScan()
            handleScanResult(raw)
          }
        } catch {
          // ignore intermittent detection errors
        }
      }, 500)
    } catch {
      setScanMessage('Camera access was unavailable. Select a player below for admin-confirmed check-in/check-out.')
      stopScan()
    }
  }

  async function confirmPendingScan() {
    if (!session || !pendingScan) return
    setConfirmingScan(true)
    try {
      const result = confirmPlayerScan(session.id, pendingScan.playerId)
      if (result.action === 'time_in') {
        toast.success(result.registeredNow
          ? `${result.playerName} checked in and added to the session.`
          : `${result.playerName} checked in.`)
      } else {
        toast.success(`${result.playerName} checked out.`)
      }
      setScanOpen(false)
      setPendingScan(null)
      setScanMessage('')
    } catch (error) {
      setScanMessage(errorMessage(error))
    } finally {
      setConfirmingScan(false)
    }
  }

  const scanCandidates = useMemo(() => {
    const query = scanQuery.trim().toLowerCase()
    const sessionPlayerByGlobalId = new Map(registrations.map((link) => [link.playerId, link]))
    const items = data.players.map((player) => {
      const link = sessionPlayerByGlobalId.get(player.id)
      const activeLog = link ? data.timeLogs.some((log) => log.sessionPlayerId === link.id && !log.timeOut) : false
      const checkedIn = link ? data.timeLogs.some((log) => log.sessionPlayerId === link.id) : false
      return {
        player,
        link,
        activeLog,
        checkedIn,
        inSession: Boolean(link),
      }
    }).filter((item) => {
      if (!query) return true
      return item.player.name.toLowerCase().includes(query)
        || item.player.contactNumber.toLowerCase().includes(query)
        || item.player.id.toLowerCase().includes(query)
    }).sort((a, b) => {
      if (a.inSession !== b.inSession) return a.inSession ? -1 : 1
      return a.player.name.localeCompare(b.player.name)
    })
    return items
  }, [data.players, data.timeLogs, registrations, scanQuery])

  return <div className="page-content">
    <PageHeader
      title="Time monitoring"
      description="Track player check-ins, intervals, and counts in real time with admin-confirmed QR actions."
      action={<div className="monitor-header-actions">
        <Button variant="outline" onClick={() => { setScanOpen(true); setScanQuery(''); setScanMessage(''); setPendingScan(null) }} disabled={!session}>
          <QrCode size={15} /> Scan Player QR Code
        </Button>
        {sessions.length > 0 ? <SessionSelect sessions={sessions} value={selectedSessionId} onChange={chooseSession} /> : null}
      </div>}
    />

    {!sessions.length ? <Card><CardContent><EmptyState title="No court sessions yet" description="Create a court session before tracking player time." /></CardContent></Card> : session ? <>
      <div className="monitor-overview" aria-label="Selected session overview">
        <div className="monitor-overview-item"><span>Session</span><strong>{court?.name ?? 'Court'}</strong><small>{formatDate(session.sessionDate, data.settings)} · {formatTime(session.startTime, data.settings.timeFormat)}–{formatTime(session.endTime, data.settings.timeFormat)}</small></div>
        <div className="monitor-overview-item"><span>State</span><strong className="monitor-badge-wrap"><StatusBadge status={session.status} /></strong><small>{session.finalizedAt ? 'Finalized and locked' : (session.status === 'active' ? 'Ready for QR/time actions' : 'Set session to Active to track time')}</small></div>
        <div className="monitor-overview-item"><span>Total Players (checked in)</span><strong>{checkedInCount}</strong><small>Unique players with a successful check-in</small></div>
        <div className="monitor-overview-item"><span>Currently Playing</span><strong>{currentlyPlayingCount}</strong><small>Players with active Time In</small></div>
        <div className="monitor-overview-item"><span>Finished Players</span><strong>{finishedPlayersCount}</strong><small>Checked in and currently timed out</small></div>
        <div className="monitor-overview-item"><span>Total rental</span><strong>{formatCurrency(totalRentalCents)}</strong><small>Session court rental</small></div>
        <div className="monitor-overview-item"><span>Total collection</span><strong>{formatCurrency(totalCollectedCents)}</strong><small>Payments recorded for this session</small></div>
        <div className="monitor-overview-item"><span>Remaining / (Over) vs rental</span><strong>{overVsRentalCents > 0 ? `${formatCurrency(overVsRentalCents)} over` : remainingVsRentalCents > 0 ? `${formatCurrency(remainingVsRentalCents)} remaining` : 'Balanced'}</strong><small>{overVsRentalCents > 0 ? 'Collected exceeds rental' : remainingVsRentalCents > 0 ? 'Still to collect vs rental' : 'Collected matches rental'}</small></div>
      </div>

      {!timeActionsEnabled && <div className="helper-note" role="status" style={{ marginBottom: 14 }}>
        <Clock3 size={16} />
        <span>{closed ? 'This session is closed. QR/time actions are unavailable.' : 'QR/time actions become available when the session is Active.'}{session.finalizedAt ? ' Finalized records are locked.' : ''}</span>
      </div>}

      <Card>
        <CardHeader>
          <div><CardTitle>Player monitoring</CardTitle><p className="card-description">Unified check-in, time tracking, payment, and notes view. Players are added on the first successful, admin-confirmed QR check-in.</p></div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/players?session=${encodeURIComponent(session.id)}`)}>Manage players</Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <EmptyState title="No players checked in" description="Scan a player QR code to register and check in the first player for this session." action={<Button variant="outline" onClick={() => setScanOpen(true)} disabled={!timeActionsEnabled}><QrCode size={14} /> Scan Player QR Code</Button>} /> : <div className="table-wrap monitor-table-wrap">
            <table className="data-table monitor-table" aria-label="Player monitoring table">
              <thead><tr>
                <th className="table-th monitor-expand-col" aria-label="Expand intervals" />
                <th className="table-th">Player Name</th>
                <th className="table-th">Status</th>
                <th className="table-th">Time In</th>
                <th className="table-th">Time Out</th>
                <th className="table-th">Hours Played</th>
                <th className="table-th">Payment</th>
                <th className="table-th">Notes</th>
                <th className="table-th">Actions</th>
              </tr></thead>
              <tbody>{rows.map((row) => {
                const isExpanded = expanded.has(row.link.id)
                const note = row.notes.trim()
                return <Fragment key={row.link.id}>
                  <tr className={row.status === 'playing' ? 'row-highlight' : undefined}>
                    <td className="table-td monitor-expand-col">
                      <button type="button" className="icon-button monitor-expand-btn" aria-label={`${isExpanded ? 'Hide' : 'View'} details for ${row.name}`} aria-expanded={isExpanded} onClick={() => toggleExpand(row.link.id)} disabled={row.logs.length === 0 && !note}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="table-td"><span className="table-primary">{row.name}</span><span className="table-secondary">{row.checkedIn ? `${row.logs.length} interval${row.logs.length === 1 ? '' : 's'}` : 'Not checked in yet'}</span></td>
                    <td className="table-td"><StatusBadge status={row.status} /></td>
                    <td className="table-td">{row.latest ? formatDateTime(row.latest.timeIn, data.settings) : <span className="row-subtle">—</span>}</td>
                    <td className="table-td">{row.latest?.timeOut ? formatDateTime(row.latest.timeOut, data.settings) : row.activeLog ? <span className="time-running">Playing now</span> : <span className="row-subtle">—</span>}</td>
                    <td className="table-td"><strong className="table-primary">{formatDuration(row.totalMinutes)}</strong></td>
                    <td className="table-td">
                      <span className="table-primary">{formatCurrency(row.amountPaidCents)} paid</span>
                      <span className="table-secondary">
                        {row.amountDueCents > 0 ? `Due ${formatCurrency(row.amountDueCents)}` : 'No charge'}
                        {row.remainingBalanceCents > 0 ? ` · ${formatCurrency(row.remainingBalanceCents)} left` : row.remainingBalanceCents < 0 ? ` · ${formatCurrency(Math.abs(row.remainingBalanceCents))} over` : ''}
                      </span>
                    </td>
                    <td className="table-td">
                      <button
                        type="button"
                        className="monitor-note-cell monitor-note-button"
                        title={note ? `Edit notes for ${row.name}` : `Add notes for ${row.name}`}
                        aria-label={note ? `Edit notes for ${row.name}` : `Add notes for ${row.name}`}
                        onClick={() => openNotes(row)}
                      >
                        {note || <span className="row-subtle">Add notes</span>}
                      </button>
                    </td>
                    <td className="table-td">
                      <div className="table-actions">
                        {row.activeLog
                          ? <Button size="sm" variant="danger" aria-label={`Time Out ${row.name}`} disabled={!timeActionsEnabled} onClick={() => prepareScan(row.link.playerId, 'manual')}><Square size={13} /> Time Out</Button>
                          : <Button size="sm" variant="primary" aria-label={`Time In ${row.name}`} disabled={!timeActionsEnabled} onClick={() => prepareScan(row.link.playerId, 'manual')}><Play size={13} /> {row.checkedIn ? 'Time In' : 'Check In'}</Button>}
                        <Button size="sm" variant="ghost" aria-label={`View details for ${row.name}`} onClick={() => toggleExpand(row.link.id)} disabled={row.logs.length === 0 && !note}>Details</Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (row.logs.length > 0 || note) && <tr className="monitor-interval-row">
                    <td className="table-td" colSpan={9}>
                      <div className="monitor-interval-panel">
                        <div className="monitor-interval-head"><strong>Details — {row.name}</strong><span className="row-subtle">Payment, notes, and interval corrections (when session is not finalized).</span></div>
                        <div className="monitor-detail-grid">
                          <div className="monitor-detail-card"><span className="field-label">Payment</span><div className="monitor-detail-value"><StatusBadge status={row.paymentStatus} /></div><p className="table-secondary" style={{ marginTop: 6 }}>{formatCurrency(row.amountPaidCents)} paid · {formatCurrency(row.amountDueCents)} due{row.remainingBalanceCents !== 0 ? ` · ${formatCurrency(Math.abs(row.remainingBalanceCents))} ${row.remainingBalanceCents > 0 ? 'remaining' : 'over'}` : ''}</p></div>
                          <div className="monitor-detail-card"><span className="field-label">Notes</span><p className="monitor-detail-notes">{note || 'No notes for this player.'}</p></div>
                        </div>
                        {row.logs.length > 0 ? <div className="table-wrap">
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
                        </div> : <p className="row-subtle" style={{ marginTop: 8 }}>No time intervals recorded yet.</p>}
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
        <Button variant="outline" size="sm" onClick={() => navigate(`/payments?session=${encodeURIComponent(session.id)}`)}>View session payments</Button>
      </div>
    </> : <Card><CardContent><EmptyState title="Select a session" description="Choose a court session to view player time." /></CardContent></Card>}

    <Dialog open={scanOpen} onOpenChange={(open) => { setScanOpen(open) }}>
      <DialogContent className="monitor-scan-dialog">
        <DialogHeader>
          <DialogTitle>Scan Player QR Code</DialogTitle>
          <DialogDescription>Scan or select a player for an admin-confirmed check-in/check-out. First-time check-in automatically adds the player to this session.</DialogDescription>
        </DialogHeader>
        <div className="monitor-scan-body">
          {pendingScan ? <div className="monitor-confirm-panel" role="status" aria-live="polite">
            <div className="monitor-confirm-main">
              <strong>{pendingScan.playerName}</strong>
              <span className="table-secondary">
                {pendingScan.willRegister ? 'First-time check-in: player will be added to this session.' : pendingScan.action === 'time_in' ? 'Player is currently timed out and will be checked in again.' : 'Player is currently playing and will be timed out.'}
              </span>
            </div>
            <div className="inline-actions">
              {pendingScan.willRegister && <span className="badge badge-info"><UserPlus size={12} /> New check-in</span>}
              <StatusBadge status={pendingScan.action === 'time_in' ? 'playing' : 'finished'} />
            </div>
            <div className="monitor-scan-actions" style={{ marginTop: 8 }}>
              <Button onClick={() => { void confirmPendingScan() }} disabled={confirmingScan || !timeActionsEnabled}>
                <Check size={14} /> {confirmingScan ? 'Confirming…' : pendingScan.action === 'time_in' ? `Confirm ${pendingScan.willRegister ? 'check-in & add player' : 'Time In'}` : 'Confirm Time Out'}
              </Button>
              <Button variant="outline" onClick={() => { setPendingScan(null); setScanMessage('') }} disabled={confirmingScan}>Back</Button>
            </div>
          </div> : <>
            <div className="monitor-scan-actions">
              <Button variant="outline" onClick={() => { void startCameraScan() }} disabled={!timeActionsEnabled || scanning}><QrCode size={15} /> {scanning ? 'Scanning…' : 'Start camera scan'}</Button>
              {scanning && <Button variant="ghost" onClick={stopScan}>Stop scan</Button>}
            </div>
            <video ref={videoRef} className="monitor-scan-video" muted playsInline style={{ display: scanning ? 'block' : 'none' }} aria-label="Camera preview for QR scanning" />
          </>}

          {scanMessage && <p className="helper-note" role="status">{scanMessage}</p>}
          {!timeActionsEnabled && <p className="field-error" role="alert">QR/time actions are available only when the session is Active and not finalized.</p>}

          {!pendingScan && <>
            <div className="form-field" style={{ marginTop: 8 }}>
              <label className="field-label" htmlFor="scan-player-search">Find player</label>
              <Input id="scan-player-search" value={scanQuery} onChange={(event) => setScanQuery(event.target.value)} placeholder="Search by name, contact, or player ID" />
            </div>
            <div className="monitor-scan-list" role="list" aria-label="Players available for QR check-in">
              {scanCandidates.length === 0 ? <p className="row-subtle">No matching players. Add players in the Players page to generate QR codes.</p> : scanCandidates.map(({ player, inSession, activeLog, checkedIn }) => <div key={player.id} className="monitor-scan-item" role="listitem">
                <div className="monitor-scan-item-main">
                  <span className="table-primary">{player.name}</span>
                  <span className="table-secondary">
                    {!inSession ? 'Not in this session · will be added on confirmed check-in' : activeLog ? 'Currently playing · next action: Time Out' : checkedIn ? 'Checked in (timed out) · next action: Time In' : 'Registered, not checked in · next action: Time In'}
                  </span>
                </div>
                <div className="inline-actions">
                  <StatusBadge status={!inSession ? 'waiting' : activeLog ? 'playing' : checkedIn ? 'finished' : 'waiting'} />
                  <Button size="sm" variant={activeLog ? 'danger' : 'primary'} aria-label={`${activeLog ? 'Prepare Time Out' : 'Prepare check-in'} for ${player.name}`} disabled={!timeActionsEnabled} onClick={() => prepareScan(player.id, 'manual')}>
                    {activeLog ? <><Square size={13} /> Time Out</> : <><Play size={13} /> {inSession && checkedIn ? 'Time In' : 'Check In'}</>}
                  </Button>
                </div>
              </div>)}
            </div>
          </>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setScanOpen(false)} disabled={confirmingScan}>Close</Button></DialogFooter>
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

    <Dialog open={Boolean(notesTarget)} onOpenChange={(open) => { if (!open) { setNotesTarget(null); setNotesDraft('') } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{notesTarget?.notes?.trim() ? 'Edit player notes' : 'Add player notes'}</DialogTitle>
          <DialogDescription>Notes for {notesTarget?.playerName ?? 'this player'} in the selected session.</DialogDescription>
        </DialogHeader>
        <div className="form-field">
          <label className="field-label" htmlFor="monitor-player-notes">Notes</label>
          <textarea
            id="monitor-player-notes"
            className="field-input field-textarea"
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="Add notes for this player..."
            rows={5}
            disabled={savingNotes || Boolean(session?.finalizedAt)}
          />
          {session?.finalizedAt && <span className="form-hint">This session is finalized. Notes cannot be edited.</span>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setNotesTarget(null); setNotesDraft('') }} disabled={savingNotes}>Cancel</Button>
          <Button type="button" onClick={() => { void saveNotes() }} disabled={savingNotes || !notesTarget || Boolean(session?.finalizedAt)}>
            <Check size={14} /> {savingNotes ? 'Saving…' : 'Save notes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
