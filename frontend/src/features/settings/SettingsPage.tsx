import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { AppSettings, PaymentMethod } from '@/domain/models'
import { useAppState } from '@/app/AppState'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { Input, Label, Select } from '@/components/ui/Field'

const paymentChoices: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
]
const defaultSettings: AppSettings = {
  systemName: 'PIKOL CHAR', defaultHourlyRateCents: 20_000, currency: 'PHP', defaultSessionMinutes: 180,
  timeFormat: '12h', dateFormat: 'MMM d, yyyy', paymentMethods: ['cash', 'gcash', 'bank_transfer', 'other'],
  calculationMethod: 'proportional_player_minutes', roundingRule: 'largest_remainder', theme: 'dark',
}

export function SettingsPage() {
  const { data, saveSettings, resetSampleData } = useAppState()
  const [settings, setSettings] = useState<AppSettings>(data.settings ?? defaultSettings)
  const [rateInput, setRateInput] = useState((data.settings.defaultHourlyRateCents / 100).toFixed(2))
  const [rateError, setRateError] = useState('')

  useEffect(() => {
    setSettings(data.settings)
    setRateInput((data.settings.defaultHourlyRateCents / 100).toFixed(2))
  }, [data.settings])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }
  const setMethod = (method: PaymentMethod, enabled: boolean) => {
    setSettings((current) => ({
      ...current,
      paymentMethods: enabled
        ? [...new Set([...current.paymentMethods, method])]
        : current.paymentMethods.filter((item) => item !== method),
    }))
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const rate = Number(rateInput)
    if (!Number.isFinite(rate) || rate < 0 || !Number.isSafeInteger(Math.round(rate * 100))) {
      setRateError('Enter a valid hourly rate in pesos.');
      return
    }
    if (!Number.isSafeInteger(settings.defaultSessionMinutes) || settings.defaultSessionMinutes < 1 || settings.defaultSessionMinutes > 899) {
      toast.error('Default session duration must be between 1 and 899 minutes for a same-day booking.')
      return
    }
    setRateError('')
    const saved: AppSettings = { ...settings, currency: 'PHP', defaultHourlyRateCents: Math.round(rate * 100) }
    try {
      saveSettings(saved)
      setSettings(saved)
      toast.success('Settings saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save settings.')
    }
  }
  const reset = () => {
    try {
      resetSampleData()
      toast.success('Sample data restored in this browser.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to restore sample data.')
    }
  }

  return <div className="page-content">
    <PageHeader title="Settings" description="Set defaults and display preferences for this browser-based workspace." />
    <form onSubmit={save}>
      <div className="settings-grid">
        <Card>
          <CardHeader><div><CardTitle>System defaults</CardTitle><p className="card-description">These defaults apply to new sessions and future displays.</p></div></CardHeader>
          <CardContent>
            <div className="form-grid">
              <div className="form-field full"><Label htmlFor="system-name">System name</Label><Input id="system-name" required maxLength={80} value={settings.systemName} onChange={(event) => update('systemName', event.target.value)} /></div>
              <div className="form-field"><Label htmlFor="default-rate">Default hourly rate (PHP)</Label><Input id="default-rate" type="number" min="0" step="0.01" inputMode="decimal" value={rateInput} onChange={(event) => { setRateInput(event.target.value); setRateError('') }} aria-invalid={Boolean(rateError)} aria-describedby={rateError ? 'rate-error' : undefined} />{rateError && <span className="field-error" id="rate-error" role="alert">{rateError}</span>}<p className="form-hint">Stored as integer centavos.</p></div>
              <div className="form-field"><Label htmlFor="currency">Currency</Label><Select id="currency" value="PHP" disabled aria-describedby="currency-note"><option value="PHP">PHP — Philippine Peso</option></Select><p className="form-hint" id="currency-note">Currency is fixed to PHP.</p></div>
              <div className="form-field"><Label htmlFor="session-duration">Default session duration (minutes)</Label><Input id="session-duration" type="number" min="1" max="899" step="1" required value={settings.defaultSessionMinutes} onChange={(event) => update('defaultSessionMinutes', Math.min(899, Math.max(1, Math.trunc(Number(event.target.value) || 1)) ))} /><p className="form-hint">From 1 to 899 minutes so a new 09:00 session ends before midnight.</p></div>
              <div className="form-field"><Label htmlFor="time-format">Time display</Label><Select id="time-format" value={settings.timeFormat} onChange={(event) => update('timeFormat', event.target.value as AppSettings['timeFormat'])}><option value="12h">12-hour</option><option value="24h">24-hour</option></Select></div>
              <div className="form-field"><Label htmlFor="date-format">Date display</Label><Select id="date-format" value={settings.dateFormat} onChange={(event) => update('dateFormat', event.target.value as AppSettings['dateFormat'])}><option value="MMM d, yyyy">MMM d, yyyy</option><option value="dd/MM/yyyy">dd/MM/yyyy</option><option value="yyyy-MM-dd">yyyy-MM-dd</option></Select></div>
              <div className="form-field full"><Label htmlFor="theme">Appearance</Label><Select id="theme" value={settings.theme ?? 'dark'} onChange={(event) => update('theme', event.target.value as AppSettings['theme'])}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></Select><p className="form-hint">Choose the interface theme for this browser workspace.</p></div>
            </div>
          </CardContent>
        </Card>
        <div>
          <Card>
            <CardHeader><div><CardTitle>Payment methods</CardTitle><p className="card-description">Choose which methods are offered for new collections and adjustments.</p></div></CardHeader>
            <CardContent>{paymentChoices.map(({ value, label }) => {
              const checked = settings.paymentMethods.includes(value)
              return <div className="preference-row" key={value}>
                <div><strong>{label}</strong><small>{checked ? 'Available for recording payments' : 'Hidden from payment entry forms'}</small></div>
                <button className="toggle" type="button" role="switch" aria-label={`${label} payment method`} aria-checked={checked} data-checked={checked} onClick={() => setMethod(value, !checked)}><span /></button>
              </div>
            })}</CardContent>
          </Card>
          <Card style={{ marginTop: 16 }}>
            <CardHeader><div><CardTitle>Calculation rules</CardTitle><p className="card-description">Applied consistently to player allocations.</p></div></CardHeader>
            <CardContent>
              <div className="form-field"><Label htmlFor="calculation-method">Calculation method</Label><Select id="calculation-method" value={settings.calculationMethod} disabled><option value="proportional_player_minutes">Proportional to player minutes</option></Select><p className="form-hint">A session’s court rental is shared in proportion to each player’s recorded minutes.</p></div>
              <div className="form-field" style={{ marginTop: 14 }}><Label htmlFor="rounding-rule">Rounding rule</Label><Select id="rounding-rule" value={settings.roundingRule} disabled><option value="largest_remainder">Largest remainder</option></Select><p className="form-hint">Centavo remainders are assigned deterministically so player charges sum to the rent.</p></div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="settings-save"><Button type="submit">Save settings</Button></div>
    </form>
    <Card style={{ marginTop: 20 }}>
      <CardHeader><div><CardTitle>Sample data</CardTitle><p className="card-description">Restore the original demo records if you want to start over.</p></div></CardHeader>
      <CardContent>
        <p className="helper-note">All sessions, player records, time logs, payments, and preferences are stored in this browser only. Clearing this browser’s site data can remove them; this is local storage, not a secure backup or multi-device sync.</p>
        <div className="settings-save"><ConfirmDialog
          trigger={<Button variant="danger">Reset sample data</Button>}
          title="Reset all browser data?"
          description="This replaces the current sessions, players, time logs, payment history, and settings with the original sample data for this browser. This cannot be undone."
          confirmLabel="Reset sample data"
          destructive
          onConfirm={reset}
        /></div>
      </CardContent>
    </Card>
  </div>
}
