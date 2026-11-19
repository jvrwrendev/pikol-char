import { format, isValid, parse } from 'date-fns'
import type { AppSettings } from '@/domain/models'

export function formatCurrency(cents: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits,
  }).format((Number.isFinite(cents) ? cents : 0) / 100)
}

export function formatDate(value: string, settings?: Pick<AppSettings, 'dateFormat'>): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (!isValid(date)) return '—'
  return format(date, settings?.dateFormat ?? 'MMM d, yyyy')
}

export function formatTime(value: string | null, formatPreference: '12h' | '24h' = '12h'): string {
  if (!value) return '—'
  const parsed = parse(value, 'HH:mm', new Date())
  if (!isValid(parsed)) return '—'
  return format(parsed, formatPreference === '12h' ? 'h:mm a' : 'HH:mm')
}

export function formatDateTime(value: string | null, settings: AppSettings): string {
  if (!value) return '—'
  const date = new Date(value)
  return isValid(date) ? format(date, `${settings.dateFormat} · ${settings.timeFormat === '12h' ? 'h:mm a' : 'HH:mm'}`) : '—'
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min'
  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)
  if (hours === 0) return `${remainder} min`
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`
}

export function formatHours(minutes: number): string {
  return `${(Math.max(0, minutes) / 60).toFixed(2)} hr`
}
