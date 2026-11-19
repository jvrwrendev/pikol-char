import { createSeedData } from './seed'
import type { AppData } from '@/domain/models'

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

function isAppData(value: unknown): value is AppData {
  if (!hasBaseData(value)) return false
  return value.schemaVersion === 2 && Array.isArray(value.reports)
}

function migrateLegacy(value: unknown): AppData | null {
  if (!hasBaseData(value) || value.schemaVersion !== 1) return null
  return { ...value, schemaVersion: 2, reports: [] } as unknown as AppData
}

export function loadAppData(): AppData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (isAppData(parsed)) return parsed
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
