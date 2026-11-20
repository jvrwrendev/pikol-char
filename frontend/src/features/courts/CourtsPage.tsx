import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAppState } from '@/app/AppState'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { FieldError, Input, Label, Select } from '@/components/ui/Field'
import { formatCurrency } from '@/lib/format'

const courtSchema = z.object({
  name: z.string().trim().min(1, 'Enter a court name.').max(80, 'Court name must be 80 characters or fewer.'),
  hourlyRate: z.coerce.number().positive('Hourly rate must be greater than zero.'),
  status: z.enum(['available', 'maintenance']),
})

type CourtFormValues = z.infer<typeof courtSchema>

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The court could not be saved.'
}

export function CourtsPage() {
  const { data, addCourt } = useAppState()
  const [dialogOpen, setDialogOpen] = useState(false)
  const form = useForm<CourtFormValues>({
    resolver: zodResolver(courtSchema),
    defaultValues: { name: '', hourlyRate: data.settings.defaultHourlyRateCents / 100, status: 'available' },
  })

  const courts = useMemo(() => [...data.courts].sort((a, b) => a.name.localeCompare(b.name)), [data.courts])
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const session of data.sessions) counts.set(session.courtId, (counts.get(session.courtId) ?? 0) + 1)
    return counts
  }, [data.sessions])

  const openCreate = () => {
    form.reset({ name: '', hourlyRate: data.settings.defaultHourlyRateCents / 100, status: 'available' })
    setDialogOpen(true)
  }

  const onSubmit = (values: CourtFormValues) => {
    try {
      addCourt({
        name: values.name,
        hourlyRateCents: Math.round(values.hourlyRate * 100),
        status: values.status,
      })
      toast.success('Court added.')
      setDialogOpen(false)
    } catch (error) {
      toast.error(messageFrom(error))
    }
  }

  return <div className="page-content">
    <PageHeader
      title="Courts"
      description="Manage court records used when scheduling sessions."
      action={<Button onClick={openCreate}>Add court</Button>}
    />

    <div className="summary-grid" aria-label="Court totals">
      <Card className="summary-card"><span>Total courts</span><strong>{courts.length}</strong></Card>
      <Card className="summary-card"><span>Available</span><strong>{courts.filter((court) => court.status === 'available').length}</strong></Card>
      <Card className="summary-card"><span>Maintenance</span><strong>{courts.filter((court) => court.status === 'maintenance').length}</strong></Card>
      <Card className="summary-card"><span>Linked sessions</span><strong>{data.sessions.length}</strong></Card>
    </div>

    <Card>
      <CardHeader>
        <div><CardTitle>All courts</CardTitle><p className="card-description">Court names, default hourly rates, and availability for scheduling.</p></div>
      </CardHeader>
      <CardContent>
        {courts.length ? <div className="table-wrap"><table className="data-table" aria-label="Courts table">
          <thead><tr>
            <th className="table-th">Court name</th>
            <th className="table-th">Hourly rate</th>
            <th className="table-th">Status</th>
            <th className="table-th">Sessions</th>
          </tr></thead>
          <tbody>{courts.map((court) => <tr key={court.id}>
            <td className="table-td"><span className="table-primary">{court.name}</span></td>
            <td className="table-td">{formatCurrency(court.hourlyRateCents)}</td>
            <td className="table-td"><StatusBadge status={court.status === 'available' ? 'active' : 'waiting'} /></td>
            <td className="table-td">{sessionCounts.get(court.id) ?? 0}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState title="No courts yet" description="Add a court to start scheduling sessions." action={<Button onClick={openCreate}>Add court</Button>} />}
      </CardContent>
    </Card>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent aria-describedby="court-form-description">
        <DialogHeader>
          <DialogTitle>Add court</DialogTitle>
          <DialogDescription id="court-form-description">Create a court record for session scheduling and rental tracking.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="form-grid">
            <div className="form-field full">
              <Label htmlFor="court-name">Court name</Label>
              <Input id="court-name" maxLength={80} placeholder="e.g. Court 3" {...form.register('name')} />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </div>
            <div className="form-field">
              <Label htmlFor="court-rate">Hourly rate (₱)</Label>
              <Input id="court-rate" type="number" min="0.01" step="0.01" inputMode="decimal" {...form.register('hourlyRate')} />
              <FieldError>{form.formState.errors.hourlyRate?.message}</FieldError>
            </div>
            <div className="form-field">
              <Label htmlFor="court-status">Status</Label>
              <Select id="court-status" {...form.register('status')}>
                <option value="available">Available</option>
                <option value="maintenance">Maintenance</option>
              </Select>
              <FieldError>{form.formState.errors.status?.message}</FieldError>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>Add court</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
