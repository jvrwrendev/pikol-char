import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { buildCollectionSummary } from '@/domain/calculations'
import type { PaymentMethod } from '@/domain/models'
import { paymentFormSchema } from '@/domain/validation'
import { formatCurrency, formatDate, formatDateTime, formatDuration } from '@/lib/format'
import { useAppState } from '@/app/AppState'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Field'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, TableWrap, Td, Th } from '@/components/ui/Table'

type CollectionFormValues = { amount: number; paymentMethod: PaymentMethod; notes?: string }
type DialogMode = 'collection' | 'adjustment'
const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash', gcash: 'GCash', bank_transfer: 'Bank Transfer', other: 'Other',
}
const allMethods: PaymentMethod[] = ['cash', 'gcash', 'bank_transfer', 'other']

export function PaymentsPage() {
  const { data, recordPayment, recordAdjustment } = useAppState()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSessionId = searchParams.get('session') ?? ''
  const [dialogMode, setDialogMode] = useState<DialogMode>('collection')
  const [activePlayerId, setActivePlayerId] = useState('')
  const [historyPlayerId, setHistoryPlayerId] = useState('')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentMethod, setAdjustmentMethod] = useState<PaymentMethod>('cash')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const activeSessions = [...data.sessions]
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.startTime.localeCompare(a.startTime))
  const selectedSession = activeSessions.find((session) => session.id === requestedSessionId) ?? activeSessions[0]
  const sessionPlayers = selectedSession
    ? data.sessionPlayers.filter((player) => player.sessionId === selectedSession.id)
    : []
  const sessionPlayerIds = new Set(sessionPlayers.map((player) => player.id))
  const sessionPayments = data.payments.filter((payment) => sessionPlayerIds.has(payment.sessionPlayerId))
  const summary = selectedSession
    ? buildCollectionSummary(selectedSession, sessionPlayers, data.timeLogs, sessionPayments)
    : null
  const playerNames = new Map(data.players.map((player) => [player.id, player.name]))
  const financeByPlayer = new Map(summary?.players.map((player) => [player.sessionPlayerId, player]) ?? [])
  const selectedPlayer = sessionPlayers.find((player) => player.id === activePlayerId)
  const historyPlayer = sessionPlayers.find((player) => player.id === historyPlayerId)
  const playerHistory = sessionPayments
    .filter((payment) => payment.sessionPlayerId === historyPlayerId)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt))
  const availableMethods = data.settings.paymentMethods
  const adjustmentMethods = availableMethods.length ? availableMethods : allMethods
  const collectionForm = useForm<CollectionFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { amount: 0, paymentMethod: availableMethods[0] ?? 'cash', notes: '' },
  })
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = collectionForm

  useEffect(() => {
    if (activePlayerId) reset({ amount: 0, paymentMethod: availableMethods[0] ?? 'cash', notes: '' })
  }, [activePlayerId, availableMethods, reset])

  const paymentDialogOpen = Boolean(activePlayerId)
  const selectedPlayerFinance = selectedPlayer ? financeByPlayer.get(selectedPlayer.id) : undefined
  const selectedPlayerName = selectedPlayer
    ? playerNames.get(selectedPlayer.playerId) ?? 'Unknown player'
    : ''
  const outstandingTotal = summary ? summary.totalAmountDueCents - summary.totalCollectedCents : 0

  const openCollection = (sessionPlayerId: string) => {
    setDialogMode('collection')
    setActivePlayerId(sessionPlayerId)
  }
  const openAdjustment = (sessionPlayerId: string, method?: PaymentMethod) => {
    setDialogMode('adjustment')
    setAdjustmentAmount('')
    setAdjustmentMethod(method ?? adjustmentMethods[0] ?? 'cash')
    setAdjustmentReason('')
    setActivePlayerId(sessionPlayerId)
  }
  const closePaymentDialog = (open: boolean) => {
    if (!open) setActivePlayerId('')
  }

  const submitCollection = handleSubmit((values) => {
    if (!selectedPlayer) return
    try {
      recordPayment(selectedPlayer.id, Math.round(values.amount * 100), values.paymentMethod, values.notes ?? '')
      toast.success(`Payment recorded for ${selectedPlayerName}.`)
      setActivePlayerId('')
      reset()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record payment.')
    }
  })

  const submitAdjustment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPlayer) return
    const value = Number(adjustmentAmount)
    if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100)) || Math.round(value * 100) === 0) {
      toast.error('Enter a non-zero signed amount in pesos.')
      return
    }
    if (!adjustmentReason.trim()) {
      toast.error('Enter a reason for the adjustment.')
      return
    }
    try {
      recordAdjustment(selectedPlayer.id, Math.round(value * 100), adjustmentMethod, adjustmentReason)
      toast.success('Adjustment appended to payment history.')
      setActivePlayerId('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record adjustment.')
    }
  }

  const sortedRows = useMemo(() => summary?.players ?? [], [summary])

  return <div className="page-content">
    <PageHeader title="Payments" description="Track collections against each session’s shared court rental." />
    <div className="toolbar">
      <div className="toolbar-left">
        <Label htmlFor="payment-session" className="filter-label">Session</Label>
        <Select id="payment-session" value={selectedSession?.id ?? ''} onChange={(event) => setSearchParams((params) => { params.set('session', event.target.value); return params }, { replace: true })}>
          {activeSessions.map((session) => <option key={session.id} value={session.id}>
            {formatDate(session.sessionDate, data.settings)} · {data.courts.find((court) => court.id === session.courtId)?.name ?? 'Court'} · {session.startTime}–{session.endTime}
          </option>)}
        </Select>
        {selectedSession?.finalizedAt && <span className="muted-copy">Finalized · charges are locked</span>}
      </div>
    </div>
    {availableMethods.length === 0 && <div className="helper-note" role="status">All collection methods are disabled. Enable at least one payment method in Settings to record new collections.</div>}

    {!selectedSession || !summary ? <Card><CardContent><EmptyState title="No sessions to collect" description="Create a session before recording player payments." /></CardContent></Card> : <>
      <div className="summary-grid" aria-label="Collection summary">
        <Card className="summary-card"><span>Total court rental</span><strong>{formatCurrency(summary.totalRentalCents)}</strong></Card>
        <Card className="summary-card"><span>Total amount due</span><strong>{formatCurrency(summary.totalAmountDueCents)}</strong></Card>
        <Card className="summary-card"><span>Total collected</span><strong>{formatCurrency(summary.totalCollectedCents)}</strong></Card>
        <Card className="summary-card"><span>Outstanding balance</span><strong className={outstandingTotal < 0 ? 'balance-negative' : undefined}>{formatCurrency(outstandingTotal)}</strong></Card>
        <Card className="summary-card"><span>Paid players</span><strong>{summary.paidPlayers}</strong></Card>
        <Card className="summary-card"><span>Unpaid players</span><strong>{summary.unpaidPlayers}</strong><span>Includes partially paid players</span></Card>
      </div>
      <Card>
        <CardHeader><div><CardTitle>Player balances</CardTitle><p className="card-description">Player shares follow recorded playing time. A negative balance is a credit.</p></div></CardHeader>
        <CardContent>
          {sortedRows.length === 0 ? <EmptyState title="No players registered" description="This session does not have any registered players yet." /> : <TableWrap>
            <Table>
              <thead><tr><Th>Player</Th><Th>Hours played</Th><Th>Due</Th><Th>Amount paid</Th><Th>Remaining balance</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
              <tbody>{sortedRows.map((finance) => {
                const link = sessionPlayers.find((player) => player.id === finance.sessionPlayerId)
                if (!link) return null
                const name = playerNames.get(link.playerId) ?? 'Unknown player'
                return <tr key={finance.sessionPlayerId}>
                  <Td><span className="table-primary">{name}</span></Td>
                  <Td>{formatDuration(finance.minutes)}</Td>
                  <Td className="payment-amount">{formatCurrency(finance.amountDueCents)}</Td>
                  <Td className="payment-amount">{formatCurrency(finance.amountPaidCents)}</Td>
                  <Td className={`payment-amount ${finance.remainingBalanceCents < 0 ? 'balance-negative' : ''}`}>
                    {formatCurrency(finance.remainingBalanceCents)}{finance.remainingBalanceCents < 0 && <span className="table-secondary">Credit</span>}
                  </Td>
                  <Td><StatusBadge status={finance.paymentStatus} /></Td>
                  <Td><div className="table-actions">
                    {finance.paymentStatus !== 'not_charged' && selectedSession.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => openCollection(link.id)} disabled={availableMethods.length === 0}>Record payment</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setHistoryPlayerId(link.id)}>History ({sessionPayments.filter((payment) => payment.sessionPlayerId === link.id).length})</Button>
                  </div></Td>
                </tr>
              })}</tbody>
            </Table>
          </TableWrap>}
        </CardContent>
      </Card>
    </>}

    <Dialog open={paymentDialogOpen && dialogMode === 'collection'} onOpenChange={closePaymentDialog}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record collection</DialogTitle><DialogDescription>{selectedPlayerName} · due {formatCurrency(selectedPlayerFinance?.amountDueCents ?? 0)} · balance {formatCurrency(selectedPlayerFinance?.remainingBalanceCents ?? 0)}. Partial, full, and overpayments are accepted.</DialogDescription></DialogHeader>
        <form onSubmit={submitCollection}>
          <div className="form-grid">
            <div className="form-field"><Label htmlFor="collection-amount">Amount (PHP)</Label><Input id="collection-amount" type="number" min="0.01" step="0.01" inputMode="decimal" {...register('amount')} /><FieldError>{errors.amount?.message}</FieldError></div>
            <div className="form-field"><Label htmlFor="collection-method">Payment method</Label><Select id="collection-method" {...register('paymentMethod')}>
              {availableMethods.length === 0 ? <option value="">No methods enabled</option> : availableMethods.map((method) => <option value={method} key={method}>{methodLabels[method]}</option>)}
            </Select><FieldError>{errors.paymentMethod?.message}</FieldError></div>
            <div className="form-field full"><Label htmlFor="collection-notes">Notes (optional)</Label><Textarea id="collection-notes" maxLength={300} placeholder="Reference or collection note" {...register('notes')} /><FieldError>{errors.notes?.message}</FieldError></div>
          </div>
          <DialogFooter><Button type="submit" disabled={isSubmitting || availableMethods.length === 0}>Save collection</Button></DialogFooter>
        </form>
        <div className="dialog-footer" style={{ justifyContent: 'flex-start' }}>
          <Button variant="outline" onClick={() => openAdjustment(selectedPlayer?.id ?? '')} disabled={!selectedPlayer}>Add correction</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={paymentDialogOpen && dialogMode === 'adjustment'} onOpenChange={closePaymentDialog}>
      <DialogContent>
        <DialogHeader><DialogTitle>Append payment adjustment</DialogTitle><DialogDescription>Adjustments never overwrite prior records. Enter a signed peso amount: positive adds to collected, negative reverses it. A reason is required.</DialogDescription></DialogHeader>
        <form onSubmit={submitAdjustment}>
          <div className="form-grid">
            <div className="form-field"><Label htmlFor="adjustment-amount">Signed amount (PHP)</Label><Input id="adjustment-amount" type="number" step="0.01" inputMode="decimal" required value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} placeholder="e.g. -50.00" /></div>
            <div className="form-field"><Label htmlFor="adjustment-method">Method</Label><Select id="adjustment-method" value={adjustmentMethod} onChange={(event) => setAdjustmentMethod(event.target.value as PaymentMethod)}>{adjustmentMethods.map((method) => <option key={method} value={method}>{methodLabels[method]}</option>)}</Select></div>
            <div className="form-field full"><Label htmlFor="adjustment-reason">Reason (required)</Label><Textarea id="adjustment-reason" maxLength={300} required value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Explain why this correction is needed" /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogMode('collection')}>Back</Button><Button type="submit">Append adjustment</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(historyPlayerId)} onOpenChange={(open) => { if (!open) setHistoryPlayerId('') }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Payment history · {historyPlayer ? playerNames.get(historyPlayer.playerId) ?? 'Player' : 'Player'}</DialogTitle><DialogDescription>Collections and signed corrections are shown as append-only records.</DialogDescription></DialogHeader>
        {playerHistory.length === 0 ? <EmptyState title="No payment records" description="Collections and adjustments for this player will appear here." /> : <ul className="history-list">
          {playerHistory.map((payment) => <li className="history-item" key={payment.id}>
            <span><strong>{payment.kind === 'collection' ? 'Collection' : payment.kind === 'reversal' ? 'Reversal' : 'Adjustment'} · {methodLabels[payment.paymentMethod]}</strong>
              <span className="history-note">{formatDateTime(payment.paymentDate, data.settings)}{(payment.correctionReason || payment.notes) ? ` · ${payment.correctionReason || payment.notes}` : ''}</span>
            </span>
            <span className="inline-actions"><strong className={payment.amountCents < 0 ? 'balance-negative' : ''}>{formatCurrency(payment.amountCents)}</strong>
              <Button size="sm" variant="ghost" aria-label={`Correct record from ${formatDateTime(payment.paymentDate, data.settings)}`} onClick={() => { setHistoryPlayerId(''); openAdjustment(payment.sessionPlayerId, payment.paymentMethod) }}>Correct</Button>
            </span>
          </li>)}
        </ul>}
        <DialogFooter><Button variant="outline" onClick={() => setHistoryPlayerId('')}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {selectedSession?.finalizedAt && <div className="muted-copy" style={{ marginTop: 12 }}>This session is finalized: player charges are locked. Collection and payment-history records remain available.</div>}
  </div>
}
