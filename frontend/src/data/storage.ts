import { createSeedData } from './seed'
import type { AppData, AppSettings, ThemePreference } from '@/domain/models'

const STORAGE_KEY = 'pikol-char:workspace:v2'
const LEGACY_KEY = 'pikol-char:workspace:v1'

function hasBaseData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return Array.isArray(data.sessions)
    && Array.isArray(data.courts)
    && Array.isArray(data.players)
    && Array.isArray(data.sessionPlayers)
    && Array.isArray(data.timeLogs)
    && Array.isArray(data.payments)
    && Boolean(data.settings)
}

function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'system' ? value : 'dark'
}

function normalizeSettings(value: unknown): AppSettings {
  const seed = createSeedData().settings
  const settings = (value && typeof value === 'object' ? value : {}) as Partial<AppSettings> & Record<string, unknown>
  return {
    systemName: typeof settings.systemName === 'string' && settings.systemName.trim() ? settings.systemName : seed.systemName,
    defaultHourlyRateCents: Number.isSafeInteger(settings.defaultHourlyRateCents) && (settings.defaultHourlyRateCents as number) >= 0
      ? settings.defaultHourlyRateCents as number
      : seed.defaultHourlyRateCents,
    currency: 'PHP',
    defaultSessionMinutes: Number.isSafeInteger(settings.defaultSessionMinutes) && (settings.defaultSessionMinutes as number) >= 1
      ? Math.min(899, settings.defaultSessionMinutes as number)
      : seed.defaultSessionMinutes,
    timeFormat: settings.timeFormat === '24h' ? '24h' : '12h',
    dateFormat: settings.dateFormat === 'dd/MM/yyyy' || settings.dateFormat === 'yyyy-MM-dd' ? settings.dateFormat : 'MMM d, yyyy',
    paymentMethods: (() => {
      const methods = Array.isArray(settings.paymentMethods)
        ? settings.paymentMethods.filter((method): method is AppSettings['paymentMethods'][number] => method === 'cash' || method === 'gcash' || method === 'bank_transfer' || method === 'other')
        : []
      return methods.length ? methods : seed.paymentMethods
    })(),
    calculationMethod: 'proportional_player_minutes',
    roundingRule: 'largest_remainder',
    theme: normalizeTheme(settings.theme),
  }
}

function normalizeAppData(value: Record<string, unknown>): AppData {
  return {
    schemaVersion: 3,
    courts: Array.isArray(value.courts) ? value.courts as AppData['courts'] : [],
    sessions: Array.isArray(value.sessions) ? value.sessions as AppData['sessions'] : [],
    players: Array.isArray(value.players) ? value.players as AppData['players'] : [],
    sessionPlayers: Array.isArray(value.sessionPlayers) ? value.sessionPlayers as AppData['sessionPlayers'] : [],
    timeLogs: Array.isArray(value.timeLogs) ? value.timeLogs as AppData['timeLogs'] : [],
    payments: Array.isArray(value.payments) ? value.payments as AppData['payments'] : [],
    reports: Array.isArray(value.reports) ? value.reports as AppData['reports'] : [],
    settings: normalizeSettings(value.settings),
  }
}

function migrateLegacy(value: unknown): AppData | null {
  if (!hasBaseData(value) || value.schemaVersion !== 1) return null
  return normalizeAppData({ ...value, reports: [] })
}

export function loadAppData(): AppData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (hasBaseData(parsed) && (parsed.schemaVersion === 2 || parsed.schemaVersion === 3)) {
        const data = normalizeAppData(parsed)
        try { saveAppData(data) } catch (error) { console.warn('PIKOL CHAR migration could not yet be saved.', error) }
        return data
      }
      const migrated = migrateLegacy(parsed)
      if (migrated) {
        try { saveAppData(migrated) } catch (error) { console.warn('PIKOL CHAR migration could not yet be saved.', error) }
        return migrated
      }
    }
  } catch (error) {
    console.warn('PIKOL CHAR local data could not be read; sample data will be restored.', error)
  }
  return createSeedData()
}

export function saveAppData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('PIKOL CHAR could not save local data. Check browser storage settings.', error)
    throw new Error('Your browser could not save this change. Check available local storage and try again.')
  }
}

export function clearAppData(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_KEY)
}
