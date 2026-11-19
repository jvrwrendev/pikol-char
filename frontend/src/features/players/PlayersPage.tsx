import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays, Clock3, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAppState } from '@/app/AppState'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'
import { buildCollectionSummary } from '@/domain/calculations'
import { playerFormSchema } from '@/domain/validation'
import type { CourtSession, SessionPlayer } from '@/domain/models'
import { formatCurrency, formatDate, formatDateTime, formatDuration } from '@/lib/format'
import { z } from 'zod'

 type PlayerFormValues = z.infer<typeof playerFormSchema>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The change could not be saved. Please try again.'
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
  const current = sessions.find((session) => session.sessionDate === today && session.status === 'scheduled' && !session.finalizedAt)
  if (current) return current.id
  const upcoming = sessions.filter((session) => session.status === 'scheduled' && !session.finalizedAt)
    .sort((left, right) => `${left.sessionDate}T${left.startTime}`.localeCompare(`${right.sessionDate}T${right.startTime}`))[0]
  return upcoming?.id ?? sessions[0]?.id ?? ''
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

export function PlayersPage() {
  const { data, addPlayerToSession, editPlayer, removePlayerFromSession } = useAppState()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedSessionId, setSelectedSessionId] = useState(() => defaultSessionId(data.sessions, searchParams.get('session')))
  const [editing, setEditing] = useState<SessionPlayer | null>(null)
  const [adding, setAdding] = useState(false)
  const [registeredCount, setRegisteredCount] = useState(0)
  const sessions = useMemo(() => [...data.sessions].sort((a, b) => `${b.sessionDate}T${b.startTime}`.localeCompare(`${a.sessionDate}T${a.startTime}`)), [data.sessions])
  const session = data.sessions.find((item) => item.id === selectedSessionId)
  const court = session ? data.courts.find((item) => item.id === session.courtId) : undefined
  const registrations = session ? data.sessionPlayers.filter((link) => link.sessionId === session.id) : []
  const canManage = Boolean(session && !session.finalizedAt)
  const summary = session ? buildCollectionSummary(session, registrations, data.timeLogs, data.payments) : null

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: { name: '', contactNumber: '', notes: '' },
  })

  useEffect(() => {
    if (!selectedSessionId || !sessions.some((item) => item.id === selectedSessionId)) {
      const next = defaultSessionId(sessions, searchParams.get('session'))
      setSelectedSessionId(next)
      if (next) setSearchParams((params) => { params.set('session', next); return params }, { replace: true })
    }
  }, [searchParams, selectedSessionId, sessions, setSearchParams])

  useEffect(() => {
    if (!adding && !editing) form.reset({ name: '', contactNumber: '', notes: '' })
    if (editing) {
      const player = data.players.find((item) => item.id === editing.playerId)
      form.reset({ name: player?.name ?? '', contactNumber: player?.contactNumber ?? '', notes: editing.notes })
    }
  }, [adding, editing, data.players, form])

  useEffect(() => {
    setRegisteredCount(registrations.length)
  }, [registrations.length, selectedSessionId])

  function chooseSession(id: string) {
    setSelectedSessionId(id)
    setSearchParams((params) => { params.set('session', id); return params }, { replace: true })
  }

  function openAdd() {
    form.reset({ name: '', contactNumber: '', notes: '' })
    setEditing(null)
    setAdding(true)
  }

  async function submit(values: PlayerFormValues) {
    if (!session) return
    try {
      if (editing) {
        editPlayer(editing.id, { name: values.name, contactNumber: values.contactNumber ?? '', notes: values.notes ?? '' })
        toast.success('Player registration updated.')
      } else {
        addPlayerToSession({ sessionId: session.id, name: values.name, contactNumber: values.contactNumber, notes: values.notes })
        toast.success('Player added to the session.')
      }
      setAdding(false)
      setEditing(null)
      form.reset({ name: '', contactNumber: '', notes: '' })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function remove(link: SessionPlayer) {
    try {
      removePlayerFromSession(link.id)
      toast.success('Player removed from the session.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return <div className="page-content">
    <PageHeader title="Players" description="Manage session registrations and review each player’s time and calculated charge."
      action={<>
        {sessions.length > 0 && <SessionSelect sessions={sessions} value={selectedSessionId} onChange={chooseSession} />}
        <Button onClick={openAdd} disabled={!session || !canManage || session.status === 'completed' || session.status === 'cancelled'}><Plus size={15} /> Add player</Button>
      </>} />

    {!sessions.length ? <Card><CardContent><EmptyState title="No court sessions yet" description="Create a court session before registering players." /></CardContent></Card> : session ? <>
      <div className="session-summary" aria-label="Selected session summary">
        <div className="session-summary-item"><span>Session</span><strong>{court?.name ?? 'Court'} · {formatDate(session.sessionDate)}</strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>Schedule</span><strong>{session.startTime}–{session.endTime}</strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>Registered</span><strong>{registeredCount} player{registeredCount === 1 ? '' : 's'}</strong></div>
        <div className="session-summary-divider" />
        <div className="session-summary-item"><span>Session status</span><strong><StatusBadge status={session.finalizedAt ? 'finalized' : session.status} /></strong></div>
        {session.finalizedAt && <><div className="session-summary-divider" /><div className="session-summary-item"><span>Finalized</span><strong>{formatDateTime(session.finalizedAt, data.settings)}</strong></div></>}
      </div>

      <Card>
        <CardHeader><div><CardTitle>Registered players</CardTitle><p className="card-description">Calculated amount is based on total playing time across all intervals.</p></div>
          <div className="inline-actions"><Link className="inline-link" to={`/time-monitoring?session=${encodeURIComponent(session.id)}`}><Clock3 size={13} /> Time monitoring</Link><Link className="inline-link" to={`/payments?session=${encodeURIComponent(session.id)}`}><CreditCard size={13} /> Payments</Link></div>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? <EmptyState title="No players registered" description="Add a player to start tracking their time and session charge." action={canManage && session.status !== 'completed' && session.status !== 'cancelled' ? <Button onClick={openAdd}><Plus size={14} /> Add player</Button> : undefined} /> : <TableWrap>
            <Table>
              <thead><tr><Th>Player</Th><Th>Session date</Th><Th>Latest time in</Th><Th>Latest time out</Th><Th>Total playing time</Th><Th>Calculated payment</Th><Th>Payment status</Th><Th>Actions</Th></tr></thead>
              <tbody>{registrations.map((link) => {
                const player = data.players.find((item) => item.id === link.playerId)
                const logs = data.timeLogs.filter((item) => item.sessionPlayerId === link.id).sort((a, b) => b.timeIn.localeCompare(a.timeIn))
                const latest = logs[0]
                const finance = summary?.players.find((item) => item.sessionPlayerId === link.id)
                const minutes = finance?.minutes ?? 0
                const playerStatus = latest && !latest.timeOut ? 'playing' : latest ? 'finished' : 'waiting'
                return <tr key={link.id}>
                  <Td><span className="table-primary">{player?.name ?? 'Unknown player'}</span>{player?.contactNumber && <span className="table-secondary">{player.contactNumber}</span>}</Td>
                  <Td><span className="inline-actions"><CalendarDays size={13} />{formatDate(session.sessionDate, data.settings)}</span></Td>
                  <Td>{latest ? formatDateTime(latest.timeIn, data.settings) : '—'}</Td>
                  <Td>{latest?.timeOut ? formatDateTime(latest.timeOut, data.settings) : latest ? <span className="time-running">In progress</span> : '—'}</Td>
                  <Td><span className={playerStatus === 'playing' ? 'time-running' : ''}>{formatDuration(minutes)}</span></Td>
                  <Td><span className="payment-amount">{formatCurrency(finance?.amountDueCents ?? 0)}</span></Td>
                  <Td><StatusBadge status={finance?.paymentStatus ?? 'unpaid'} /></Td>
                  <Td><div className="table-actions">
                    {canManage && <>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${player?.name ?? 'player'} registration`} title="Edit registration" onClick={() => { setAdding(false); setEditing(link) }}><Pencil size={14} /></Button>
                      <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label={`Remove ${player?.name ?? 'player'} from session`} title="Remove registration"><Trash2 size={14} /></Button>} title="Remove player from session?" description={`Remove ${player?.name ?? 'this player'} and their time records from this session? This cannot be undone.`} confirmLabel="Remove player" destructive onConfirm={() => remove(link)} />
                    </>}
                  </div></Td>
                </tr>
              })}</tbody>
            </Table>
          </TableWrap>}
        </CardContent>
      </Card>
      {summary && <div className="summary-grid" style={{ marginTop: 15 }}>
        <Card className="summary-card"><span>Players registered</span><strong>{registrations.length}</strong></Card>
        <Card className="summary-card"><span>Total player time</span><strong>{formatDuration(summary.totalPlayerMinutes)}</strong></Card>
        <Card className="summary-card"><span>Calculated charges</span><strong>{formatCurrency(summary.totalAmountDueCents)}</strong></Card>
        <Card className="summary-card"><span>Collected</span><strong>{formatCurrency(summary.totalCollectedCents)}</strong></Card>
      </div>}
    </> : <Card><CardContent><EmptyState title="Select a session" description="Choose a court session to manage its player registrations." /></CardContent></Card>}

    <Dialog open={adding || Boolean(editing)} onOpenChange={(open) => { if (!open) { setAdding(false); setEditing(null) } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit player registration' : 'Add player'}</DialogTitle><DialogDescription>{editing ? 'Update the player details for this session.' : 'Register a player for the selected court session.'}</DialogDescription></DialogHeader>
        <form onSubmit={form.handleSubmit(submit)}>
          <div className="form-grid">
            <div className="form-field full"><label className="field-label" htmlFor="player-name">Name <span aria-hidden="true">*</span></label><input id="player-name" className="field-input" autoFocus {...form.register('name')} aria-invalid={Boolean(form.formState.errors.name)} />{form.formState.errors.name && <span className="field-error" role="alert">{form.formState.errors.name.message}</span>}</div>
            <div className="form-field full"><label className="field-label" htmlFor="player-contact">Contact number <span className="muted-copy">(optional)</span></label><input id="player-contact" className="field-input" {...form.register('contactNumber')} aria-invalid={Boolean(form.formState.errors.contactNumber)} />{form.formState.errors.contactNumber && <span className="field-error" role="alert">{form.formState.errors.contactNumber.message}</span>}</div>
            <div className="form-field full"><label className="field-label" htmlFor="player-notes">Notes <span className="muted-copy">(optional)</span></label><textarea id="player-notes" className="field-input field-textarea" {...form.register('notes')} aria-invalid={Boolean(form.formState.errors.notes)} />{form.formState.errors.notes && <span className="field-error" role="alert">{form.formState.errors.notes.message}</span>}</div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAdding(false); setEditing(null) }}>Cancel</Button><Button type="submit" disabled={form.formState.isSubmitting}>{editing ? 'Save changes' : 'Add player'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
