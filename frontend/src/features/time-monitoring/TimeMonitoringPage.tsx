import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Pencil, Play, Square, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAppState } from '@/app/AppState'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { buildCollectionSummary, totalPlayerMinutes } from '@/domain/calculations'
import { validateTimeLog } from '@/domain/validation'
import type { CourtSession, PlayerTimeLog } from '@/domain/models'
import { useIntervalTick } from '@/hooks/useInterval'
import { formatDate, formatDateTime, formatDuration } from '@/lib/format'

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
  return <label className="form-field" style={{ minWidth: 220 }}>
    <span className="field-label">Court session</span>
    <select className="field-input field-select" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Select court session">
      {sessions.map((session) => <option key={session.id} value={session.id}>
        {formatDate(session.sessionDate)} · {session.startTime}–{session.endTime} · {session.status}
      </option>)}
    </select>
  </label>
}

export function TimeMonitoringPage() {
  const { data, timeIn, timeOut, editTimeLog } = useAppState()
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useIntervalTick(30_000)
  const sessions = useMemo(() => [...data.sessions].sort((a, b) => `${b.sessionDate}T${b.startTime}`.localeCompare(`${a.sessionDate}T${a.startTime}`)), [data.sessions])
  const [selectedSessionId, setSelectedSessionId] = useState(() => defaultSessionId(data.sessions, searchParams.get('session')))
  const [editingLog, setEditingLog] = useState<PlayerTimeLog | null>(null)
  const [editError, setEditError] = useState('')
  const session = data.sessions.find((item) => item.id === selectedSessionId)
  const scheduledEnd = session ? new Date(`${session.sessionDate}T${session.endTime}:00`) : null
  const boundedNow = scheduledEnd && Number.isFinite(scheduledEnd.getTime()) && now.getTime() > scheduledEnd.getTime() ? scheduledEnd : now
  const court = session ? data.courts.find((item) => item.id === session.courtId) : undefined
  const registrations = session ? data.sessionPlayers.filter((item) => item.sessionId === session.id) : []
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

  return <div className="page-content">
    <PageHeader title="Time monitoring" description="Track player intervals in real time; durations include every completed and active interval."
      action={sessions.length > 0 ? <SessionSelect sessions={sessions} value={selectedSessionId} onChange={chooseSession} /> : undefined} />

    {!sessions.length ? <Card><CardContent><EmptyState title="No court sessions yet" description="Create a court session before tracking player time." /></CardContent></Card> : session ? <>
      <div className="session-summary" aria-label="Selected session summary">
        <div className="session-summary-item"><span>Session</span><strong>{court?.name ?? 'Court'} · {formatDate(session.sessionDate, data.settings)}</strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>Schedule</span><strong>{session.startTime}–{session.endTime}</strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>State</span><strong><StatusBadge status={session.finalizedAt ? 'finalized' : session.status} /></strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>Players currently playing</span><strong>{activePlayers} / {registrations.length}</strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>Session time</span><strong>{formatDuration(summary?.totalPlayerMinutes ?? 0)}</strong></div>
      </div>
      {!timeActionsEnabled && <div className="helper-note" role="status">{closed ? 'This session is closed. Time actions are unavailable.' : 'Time actions become available when the session is Active.'}{session.finalizedAt ? ' Finalized records are locked.' : ''}</div>}

      <Card style={{ marginTop: 15 }}>
        <CardHeader><div><CardTitle>Player time log</CardTitle><p className="card-description">Time in and out controls are enabled only while this session is active.</p></div><Link className="inline-link" to={`/players?session=${encodeURIComponent(session.id)}`}><Users size={13} /> Manage players</Link></CardHeader>
        <CardContent>
          {registrations.length === 0 ? <EmptyState title="No players registered" description="Register players before tracking their time." action={<Link className="inline-link" to={`/players?session=${encodeURIComponent(session.id)}`}>Go to player registrations</Link>} /> : <div className="live-panel">
            {registrations.map((link) => {
              const player = data.players.find((item) => item.id === link.playerId)
              const logs = data.timeLogs.filter((log) => log.sessionPlayerId === link.id).sort((a, b) => a.timeIn.localeCompare(b.timeIn))
              const activeLog = logs.find((log) => !log.timeOut)
              const latest = logs[logs.length - 1]
              const playerState = activeLog ? 'playing' : logs.length ? 'finished' : 'waiting'
              const totalMinutes = totalPlayerMinutes(link.id, data.timeLogs, boundedNow)
              const stateLabel = playerState === 'playing' ? 'Playing' : playerState === 'finished' ? 'Finished' : 'Waiting'
              return <article className="live-row" key={link.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div className="person-cell"><span className="person-initial" aria-hidden="true">{player?.name.slice(0, 1).toUpperCase() ?? '?'}</span><div><span className="person-name">{player?.name ?? 'Unknown player'}</span><span className="person-meta">{stateLabel} · {formatDuration(totalMinutes)} total</span></div></div>
                  {latest && <div className="row-subtle" style={{ margin: '8px 0 0 38px' }}>
                    Latest interval: {formatDateTime(latest.timeIn, data.settings)} → {latest.timeOut ? formatDateTime(latest.timeOut, data.settings) : <span className="time-running">In progress</span>}
                  </div>}
                </div>
                <div className="inline-actions" style={{ flex: '0 1 auto' }}>
                  {activeLog ? <Button size="sm" variant="danger" aria-label={`Time Out ${player?.name ?? 'player'}`} disabled={!timeActionsEnabled} onClick={() => registerTimeOut(link.id)}><Square size={13} /> Time Out</Button>
                    : <Button size="sm" variant="primary" aria-label={`Time In ${player?.name ?? 'player'}`} disabled={!timeActionsEnabled} onClick={() => registerTimeIn(link.id)}><Play size={13} /> Time In</Button>}
                  {latest && !session.finalizedAt && <Button size="sm" variant="outline" aria-label={`Correct time interval for ${player?.name ?? 'player'}`} onClick={() => setEditingLog(latest)}><Pencil size={13} /> Correct</Button>}
                </div>
                {logs.length > 0 && <div className="table-wrap" style={{ flex: '1 0 100%', marginLeft: 38 }}>
                  <table className="data-table" aria-label={`${player?.name ?? 'Player'} time intervals`}>
                    <thead><tr><th className="table-th">Interval</th><th className="table-th">Time in</th><th className="table-th">Time out</th><th className="table-th">Duration</th><th className="table-th">Correction</th></tr></thead>
                    <tbody>{logs.map((log, index) => <tr key={log.id}>
                      <td className="table-td">{index + 1}</td>
                      <td className="table-td">{formatDateTime(log.timeIn, data.settings)}</td>
                      <td className="table-td">{log.timeOut ? formatDateTime(log.timeOut, data.settings) : <span className="time-running">Playing now</span>}</td>
                      <td className="table-td">{formatDuration(log.timeOut ? log.durationMinutes : totalPlayerMinutes(link.id, [log], boundedNow))}</td>
                      <td className="table-td">{!session.finalizedAt ? <Button size="sm" variant="ghost" aria-label={`Edit interval ${index + 1} for ${player?.name ?? 'player'}`} onClick={() => setEditingLog(log)}><Pencil size={13} /> Edit</Button> : <span className="row-subtle">Locked</span>}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
              </article>
            })}
          </div>}
        </CardContent>
      </Card>
      <div className="page-heading-action" style={{ justifyContent: 'flex-end', marginTop: 12 }}><Link className="inline-link" to={`/payments?session=${encodeURIComponent(session.id)}`}>View session payments</Link></div>
    </> : <Card><CardContent><EmptyState title="Select a session" description="Choose a court session to view player time." /></CardContent></Card>}

    <Dialog open={Boolean(editingLog)} onOpenChange={(open) => { if (!open) { setEditingLog(null); setEditError('') } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Correct time interval</DialogTitle><DialogDescription>Times are shown in your local timezone. Corrections must remain inside the session and cannot overlap another interval for this player.</DialogDescription></DialogHeader>
        <form onSubmit={form.handleSubmit(submitEdit)}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label" htmlFor="time-in-edit">Time In</label><input className="field-input" id="time-in-edit" type="datetime-local" step="60" {...form.register('timeIn')} aria-invalid={Boolean(form.formState.errors.timeIn)} />{form.formState.errors.timeIn && <span className="field-error" role="alert">{form.formState.errors.timeIn.message}</span>}</div>
            <div className="form-field"><label className="field-label" htmlFor="time-out-edit">Time Out <span className="muted-copy">(leave blank if still playing)</span></label><input className="field-input" id="time-out-edit" type="datetime-local" step="60" {...form.register('timeOut')} aria-invalid={Boolean(form.formState.errors.timeOut)} />{form.formState.errors.timeOut && <span className="field-error" role="alert">{form.formState.errors.timeOut.message}</span>}</div>
          </div>
          {editError && <p className="field-error" role="alert">{editError}</p>}
          <DialogFooter><Button variant="outline" onClick={() => { setEditingLog(null); setEditError('') }}>Cancel</Button><Button type="submit" disabled={form.formState.isSubmitting}><Check size={14} /> Save correction</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
