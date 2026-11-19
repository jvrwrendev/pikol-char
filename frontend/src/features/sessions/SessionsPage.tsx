import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { ArrowRight, Clock3, Eye, Pencil, Play, UserRoundPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppState } from '@/app/AppState'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Field'
import { buildCollectionSummary, sessionDurationMinutes } from '@/domain/calculations'
import { sessionFormSchema } from '@/domain/validation'
import type { CourtSession } from '@/domain/models'
import { formatCurrency, formatDate, formatDuration, formatTime } from '@/lib/format'

type SessionFormInput = {
  sessionDate: string
  courtId: string
  startTime: string
  endTime: string
  hourlyRate: number
  notes?: string
}
const NEW_COURT = '__new_court__'

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The session could not be saved. Please try again.'
}

function defaultEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number)
  const start = hours * 60 + minutes
  const end = Math.max(start + 1, Math.min(23 * 60 + 59, start + Math.max(1, Math.trunc(durationMinutes))))
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

export function SessionsPage() {
  const { data, addSession, editSession, setSessionStatus, finalizeSession } = useAppState()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<CourtSession | null>(null)
  const [viewingSession, setViewingSession] = useState<CourtSession | null>(null)
  const [newCourtName, setNewCourtName] = useState('')
  const form = useForm<SessionFormInput>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: { sessionDate: '', courtId: '', startTime: '09:00', endTime: defaultEndTime('09:00', data.settings.defaultSessionMinutes), hourlyRate: data.settings.defaultHourlyRateCents / 100, notes: '' },
  })
  const courtId = form.watch('courtId')

  const rows = useMemo(() => data.sessions.map((session) => {
    const links = data.sessionPlayers.filter((player) => player.sessionId === session.id)
    const linkedIds = new Set(links.map((player) => player.id))
    const summary = buildCollectionSummary(
      session,
      links,
      data.timeLogs.filter((log) => linkedIds.has(log.sessionPlayerId)),
      data.payments.filter((payment) => linkedIds.has(payment.sessionPlayerId)),
    )
    return {
      session,
      links,
      summary,
      courtName: data.courts.find((court) => court.id === session.courtId)?.name ?? 'Court unavailable',
      duration: sessionDurationMinutes(session.startTime, session.endTime),
    }
  }).sort((a, b) => `${b.session.sessionDate}T${b.session.startTime}`.localeCompare(`${a.session.sessionDate}T${a.session.startTime}`)), [data])

  const openCreate = () => {
    setEditingSession(null)
    setNewCourtName('')
    form.reset({
      sessionDate: (() => { const today = new Date(); return new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) })(),
      courtId: data.courts[0]?.id ?? NEW_COURT,
      startTime: '09:00',
      endTime: defaultEndTime('09:00', data.settings.defaultSessionMinutes),
      hourlyRate: data.settings.defaultHourlyRateCents / 100,
      notes: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (session: CourtSession) => {
    if (session.finalizedAt) {
      toast.error('Finalized sessions are locked and cannot be edited.')
      return
    }
    setEditingSession(session)
    setNewCourtName('')
    form.reset({
      sessionDate: session.sessionDate,
      courtId: session.courtId,
      startTime: session.startTime,
      endTime: session.endTime,
      hourlyRate: session.hourlyRateCents / 100,
      notes: session.notes,
    })
    setDialogOpen(true)
  }

  const onSubmit: SubmitHandler<SessionFormInput> = (values) => {
    const selectedCourt = data.courts.find((court) => court.id === values.courtId)
    const courtName = values.courtId === NEW_COURT ? newCourtName.trim() : selectedCourt?.name
    if (!courtName) {
      form.setError('courtId', { type: 'manual', message: 'Choose an existing court or enter a new court name.' })
      return
    }
    const normalizedCourt = courtName.toLocaleLowerCase()
    const matchingCourtId = data.courts.find((court) => court.name.trim().toLocaleLowerCase() === normalizedCourt)?.id
    const candidateCourtId = matchingCourtId ?? values.courtId
    const start = values.startTime
    const end = values.endTime
    const overlap = data.sessions.find((session) => {
      if (session.id === editingSession?.id || session.status === 'cancelled') return false
      if (session.courtId !== candidateCourtId || session.sessionDate !== values.sessionDate) return false
      return start < session.endTime && session.startTime < end
    })
    if (overlap) {
      form.setError('endTime', { type: 'manual', message: 'This court already has a session that overlaps the selected schedule.' })
      return
    }

    try {
      const draft = {
        courtName,
        sessionDate: values.sessionDate,
        startTime: values.startTime,
        endTime: values.endTime,
        hourlyRateCents: Math.round(Number(values.hourlyRate) * 100),
        notes: values.notes ?? '',
      }
      if (editingSession) {
        editSession(editingSession.id, draft)
        toast.success('Session updated.')
      } else {
        addSession(draft)
        toast.success('Session created.')
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error(messageFrom(error))
    }
  }

  const setStatus = (session: CourtSession, status: CourtSession['status']) => {
    try {
      setSessionStatus(session.id, status)
      toast.success(`Session marked ${status}.`)
    } catch (error) {
      toast.error(messageFrom(error))
    }
  }

  const finalize = (session: CourtSession) => {
    try {
      finalizeSession(session.id)
      toast.success('Session finalized and locked.')
    } catch (error) {
      toast.error(messageFrom(error))
    }
  }

  const selectedView = viewingSession ? rows.find((row) => row.session.id === viewingSession.id) : undefined
  const filterId = searchParams.get('session')

  return <div className="page-content">
    <PageHeader
      title="Court sessions"
      description="Schedule courts, manage session activity, and review collection progress."
      action={<Button onClick={openCreate}>Create session</Button>}
    />

    <div className="summary-grid" aria-label="Session totals">
      <Card className="summary-card"><span>Total sessions</span><strong>{rows.length}</strong></Card>
      <Card className="summary-card"><span>Scheduled</span><strong>{rows.filter(({ session }) => session.status === 'scheduled').length}</strong></Card>
      <Card className="summary-card"><span>In progress</span><strong>{rows.filter(({ session }) => session.status === 'active').length}</strong></Card>
      <Card className="summary-card"><span>Expected rent</span><strong>{formatCurrency(rows.filter(({ session }) => session.status !== 'cancelled').reduce((sum, row) => sum + row.summary.totalRentalCents, 0))}</strong></Card>
    </div>

    <Card>
      <CardHeader><div><CardTitle>Session register</CardTitle><p className="card-description">Schedules, rental totals, and settlement status from current records.</p></div></CardHeader>
      <CardContent>
        {rows.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr>
            <th className="table-th">Date / court</th><th className="table-th">Schedule</th><th className="table-th">Duration</th><th className="table-th">Rate / hr</th><th className="table-th">Rent</th><th className="table-th">Players</th><th className="table-th">Session</th><th className="table-th">Collection</th><th className="table-th">Actions</th>
          </tr></thead>
          <tbody>{rows.map(({ session, links, summary, courtName, duration }) => {
            const collectionStatus = summary.totalAmountDueCents <= 0 ? 'not_charged' : summary.outstandingBalanceCents <= 0 ? 'paid' : summary.totalCollectedCents > 0 ? 'partially_paid' : 'unpaid'
            const highlighted = filterId === session.id
            return <tr key={session.id} className={highlighted ? 'row-highlight' : undefined}>
              <td className="table-td"><span className="table-primary">{formatDate(session.sessionDate, data.settings)}</span><span className="table-secondary">{courtName}</span></td>
              <td className="table-td">{formatTime(session.startTime, data.settings.timeFormat)}–{formatTime(session.endTime, data.settings.timeFormat)}</td>
              <td className="table-td">{formatDuration(duration)}</td>
              <td className="table-td">{formatCurrency(session.hourlyRateCents)}</td>
              <td className="table-td"><span className="table-primary">{formatCurrency(summary.totalRentalCents)}</span><span className="table-secondary">due {formatCurrency(summary.totalAmountDueCents)}</span></td>
              <td className="table-td">{links.length}</td>
              <td className="table-td"><StatusBadge status={session.status} />{session.finalizedAt && <span className="table-secondary">Finalized</span>}</td>
              <td className="table-td"><StatusBadge status={collectionStatus} /><span className="table-secondary">{formatCurrency(summary.totalCollectedCents)} collected</span></td>
              <td className="table-td">
                <div className="table-actions" aria-label={`Actions for ${courtName} session`}>
                  <Button size="icon" variant="ghost" aria-label={`View ${courtName} session`} title="View session" onClick={() => setViewingSession(session)}><Eye size={14} /></Button>
                  {!session.finalizedAt && <Button size="icon" variant="ghost" aria-label={`Edit ${courtName} session`} title="Edit session" onClick={() => openEdit(session)}><Pencil size={14} /></Button>}
                  <Button size="icon" variant="ghost" aria-label={`Manage players for ${courtName}`} title="Manage players" onClick={() => navigate(`/players?session=${encodeURIComponent(session.id)}`)}><UserRoundPlus size={14} /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Monitor time for ${courtName}`} title="Time monitoring" onClick={() => navigate(`/time-monitoring?session=${encodeURIComponent(session.id)}`)}><ClockIcon /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Open payments for ${courtName}`} title="Payments" onClick={() => navigate(`/payments?session=${encodeURIComponent(session.id)}`)}><WalletIcon /></Button>
                  {!session.finalizedAt && session.status === 'scheduled' && <ConfirmDialog
                    trigger={<Button size="icon" variant="ghost" aria-label={`Start ${courtName} session`} title="Start session"><Play size={14} /></Button>}
                    title="Start this session?" description={`Mark the ${courtName} booking as active. Player time records can then be started.`} confirmLabel="Start session" onConfirm={() => setStatus(session, 'active')}
                  />}
                  {!session.finalizedAt && session.status === 'active' && <ConfirmDialog
                    trigger={<Button size="sm" variant="outline" aria-label={`Complete ${courtName} session`}>Complete</Button>}
                    title="Complete this session?" description="This closes the court session. Any player currently checked in must be timed out first." confirmLabel="Complete session" onConfirm={() => setStatus(session, 'completed')}
                  />}
                  {!session.finalizedAt && session.status === 'completed' && <ConfirmDialog
                    trigger={<Button size="sm" variant="outline" aria-label={`Finalize ${courtName} session`}>Finalize</Button>}
                    title="Finalize this session?" description="Finalization locks this session's schedule and records. Confirm that player time and collection details are complete." confirmLabel="Finalize and lock" onConfirm={() => finalize(session)}
                  />}
                  {!session.finalizedAt && (session.status === 'scheduled' || session.status === 'active') && <ConfirmDialog
                    trigger={<Button size="icon" variant="ghost" aria-label={`Cancel ${courtName} session`} title="Cancel session"><span aria-hidden="true">×</span></Button>}
                    title="Cancel this session?" description="The session will remain in your records as Cancelled. This action can’t be undone here." confirmLabel="Cancel session" destructive onConfirm={() => setStatus(session, 'cancelled')}
                  />}
                </div>
              </td>
            </tr>
          })}</tbody>
        </table></div> : <EmptyState title="No court sessions" description="Create your first session to begin organizing court schedules and collections." action={<Button onClick={openCreate}>Create session</Button>} />}
      </CardContent>
    </Card>

    <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingSession(null) }}>
      <DialogContent aria-describedby="session-form-description">
        <DialogHeader>
          <DialogTitle>{editingSession ? 'Edit session' : 'Create court session'}</DialogTitle>
          <DialogDescription id="session-form-description">Set the court schedule and hourly rental rate. Rent is calculated from the session duration.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="form-grid">
            <div className="form-field">
              <Label htmlFor="session-date">Session date</Label>
              <Input id="session-date" type="date" {...form.register('sessionDate')} />
              <FieldError>{form.formState.errors.sessionDate?.message}</FieldError>
            </div>
            <div className="form-field">
              <Label htmlFor="session-court">Court</Label>
              <Select id="session-court" {...form.register('courtId')}>
                {data.courts.map((court) => <option value={court.id} key={court.id}>{court.name}</option>)}
                <option value={NEW_COURT}>Add a new court…</option>
              </Select>
              <FieldError>{form.formState.errors.courtId?.message}</FieldError>
            </div>
            {courtId === NEW_COURT && <div className="form-field full">
              <Label htmlFor="new-court-name">New court name</Label>
              <Input id="new-court-name" value={newCourtName} onChange={(event) => setNewCourtName(event.target.value)} placeholder="e.g. Court 3" maxLength={80} />
              <p className="form-hint">If this name already exists, the existing court record will be used.</p>
            </div>}
            <div className="form-field">
              <Label htmlFor="session-start">Start time</Label>
              <Input id="session-start" type="time" {...form.register('startTime')} />
              <FieldError>{form.formState.errors.startTime?.message}</FieldError>
            </div>
            <div className="form-field">
              <Label htmlFor="session-end">End time</Label>
              <Input id="session-end" type="time" {...form.register('endTime')} />
              <FieldError>{form.formState.errors.endTime?.message}</FieldError>
            </div>
            <div className="form-field">
              <Label htmlFor="session-rate">Hourly rate (₱)</Label>
              <Input id="session-rate" type="number" min="0.01" step="0.01" inputMode="decimal" {...form.register('hourlyRate')} />
              <p className="form-hint">Stored in centavos; current entry converts to {formatCurrency(Math.round((Number(form.watch('hourlyRate')) || 0) * 100))}.</p>
              <FieldError>{form.formState.errors.hourlyRate?.message}</FieldError>
            </div>
            <div className="form-field full">
              <Label htmlFor="session-notes">Notes <span className="muted-copy">(optional)</span></Label>
              <Textarea id="session-notes" maxLength={300} placeholder="Special instructions or booking details" {...form.register('notes')} />
              <FieldError>{form.formState.errors.notes?.message}</FieldError>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Close</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{editingSession ? 'Save changes' : 'Create session'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(viewingSession)} onOpenChange={(open) => { if (!open) setViewingSession(null) }}>
      <DialogContent aria-describedby="session-detail-description">
        <DialogHeader>
          <DialogTitle>Session details</DialogTitle>
          <DialogDescription id="session-detail-description">Schedule and collection snapshot for this court booking.</DialogDescription>
        </DialogHeader>
        {selectedView && <>
          <div className="session-summary">
            <div className="session-summary-item"><span>Court</span><strong>{selectedView.courtName}</strong></div>
            <div className="session-summary-divider" />
            <div className="session-summary-item"><span>Status</span><strong><StatusBadge status={selectedView.session.status} /></strong></div>
          </div>
          <div className="live-panel">
            <DetailRow label="Date" value={formatDate(selectedView.session.sessionDate, data.settings)} />
            <DetailRow label="Schedule" value={`${formatTime(selectedView.session.startTime, data.settings.timeFormat)}–${formatTime(selectedView.session.endTime, data.settings.timeFormat)} · ${formatDuration(selectedView.duration)}`} />
            <DetailRow label="Hourly rate" value={formatCurrency(selectedView.session.hourlyRateCents)} />
            <DetailRow label="Total rent" value={formatCurrency(selectedView.summary.totalRentalCents)} />
            <DetailRow label="Amount allocated" value={formatCurrency(selectedView.summary.totalAmountDueCents)} />
            <DetailRow label="Collected" value={formatCurrency(selectedView.summary.totalCollectedCents)} />
            <DetailRow label="Outstanding" value={formatCurrency(selectedView.summary.outstandingBalanceCents)} />
            <DetailRow label="Registered players" value={String(selectedView.links.length)} />
          </div>
          {selectedView.session.notes && <p className="helper-note" style={{ marginTop: 12 }}>{selectedView.session.notes}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingSession(null)}>Close</Button>
            <Button onClick={() => { setViewingSession(null); navigate(`/players?session=${encodeURIComponent(selectedView.session.id)}`) }}>Manage players <ArrowRight size={14} /></Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </div>
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="live-row"><span className="live-row-label">{label}</span><span className="live-row-value">{value}</span></div>
}

function ClockIcon() {
  return <Clock3 size={14} aria-hidden="true" />
}

function WalletIcon() {
  return <span aria-hidden="true">₱</span>
}
