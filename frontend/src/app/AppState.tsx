import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildCollectionSummary, canFinalizeSession, intervalDurationMinutes, liquidationStatus, timeToMinutes } from '@/domain/calculations'
import { validateTimeLog } from '@/domain/validation'
import { createSeedData } from '@/data/seed'
import { loadAppData, saveAppData } from '@/data/storage'
import type { AppData, AppSettings, CourtSession, LiquidationReport, PaymentMethod, PlayerTimeLog, SessionPlayer, SessionStatus } from '@/domain/models'

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`
}

function checkCourtConflict(data: AppData, candidate: Pick<CourtSession, 'id' | 'courtId' | 'sessionDate' | 'startTime' | 'endTime'>): string | null {
  const start = timeToMinutes(candidate.startTime)
  const end = timeToMinutes(candidate.endTime)
  if (start === null || end === null || end <= start) return 'End time must be later than start time.'
  const conflict = data.sessions.find((session) => {
    if (session.id === candidate.id || session.courtId !== candidate.courtId || session.sessionDate !== candidate.sessionDate) return false
    if (session.status === 'cancelled') return false
    const existingStart = timeToMinutes(session.startTime)
    const existingEnd = timeToMinutes(session.endTime)
    return existingStart !== null && existingEnd !== null && start < existingEnd && existingStart < end
  })
  return conflict ? 'This court already has a session that overlaps the selected schedule.' : null
}

function upsertReportSnapshot(data: AppData, sessionId: string): LiquidationReport[] {
  const session = data.sessions.find((item) => item.id === sessionId)
  if (!session?.finalizedAt) return data.reports
  const players = data.sessionPlayers.filter((item) => item.sessionId === sessionId)
  const playerIds = new Set(players.map((item) => item.id))
  const summary = buildCollectionSummary(session, players, data.timeLogs.filter((item) => playerIds.has(item.sessionPlayerId)), data.payments.filter((item) => playerIds.has(item.sessionPlayerId)))
  const existing = data.reports.find((report) => report.sessionId === sessionId)
  const report: LiquidationReport = {
    id: existing?.id ?? makeId('report'),
    sessionId,
    totalRentalCents: summary.totalRentalCents,
    totalPlayerMinutes: summary.totalPlayerMinutes,
    totalAmountDueCents: summary.totalAmountDueCents,
    totalCollectedCents: summary.totalCollectedCents,
    remainingBalanceCents: summary.totalAmountDueCents - summary.totalCollectedCents,
    status: liquidationStatus(summary.totalCollectedCents, summary.totalRentalCents),
    finalizedAt: session.finalizedAt,
  }
  return [...data.reports.filter((item) => item.sessionId !== sessionId), report]
}

interface SessionDraft {
  courtId: string
  sessionDate: string
  startTime: string
  endTime: string
  hourlyRateCents: number
  notes: string
}
interface AddPlayerDraft {
  sessionId: string
  name: string
  contactNumber?: string
  notes?: string
}
interface ScanCheckInResult {
  sessionPlayerId: string
  playerId: string
  playerName: string
  action: 'time_in' | 'time_out'
  registeredNow: boolean
}

interface AppStateValue {
  data: AppData
  persistenceError: string | null
  addCourt: (draft: { name: string; hourlyRateCents: number; status: 'available' | 'maintenance' }) => string
  addSession: (draft: SessionDraft) => string
  editSession: (sessionId: string, changes: Partial<SessionDraft>) => void
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  deleteSession: (sessionId: string) => void
  addPlayerToSession: (draft: AddPlayerDraft) => string
  editPlayer: (sessionPlayerId: string, changes: { name: string; contactNumber: string; notes: string }) => void
  removePlayerFromSession: (sessionPlayerId: string) => void
  timeIn: (sessionPlayerId: string) => string
  timeOut: (sessionPlayerId: string) => void
  confirmPlayerScan: (sessionId: string, playerId: string) => ScanCheckInResult
  editTimeLog: (logId: string, timeIn: string, timeOut: string | null) => void
  recordPayment: (sessionPlayerId: string, amountCents: number, method: PaymentMethod, notes: string) => void
  recordAdjustment: (sessionPlayerId: string, amountCents: number, method: PaymentMethod, reason: string) => void
  finalizeSession: (sessionId: string) => void
  saveSettings: (settings: AppSettings) => void
  resetSampleData: () => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadAppData())
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    const root = document.documentElement
    const theme = data.settings.theme ?? 'dark'
    const apply = (resolved: 'dark' | 'light') => {
      root.dataset.theme = resolved
      root.style.colorScheme = resolved
    }

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const sync = () => apply(media.matches ? 'dark' : 'light')
      sync()
      media.addEventListener('change', sync)
      return () => media.removeEventListener('change', sync)
    }

    apply(theme)
  }, [data.settings.theme])

  useEffect(() => {
    try {
      saveAppData(data)
      setPersistenceError(null)
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : 'This browser could not save your records.')
    }
  }, [])

  const actions = useMemo<AppStateValue>(() => {
    const update = (transform: (current: AppData) => AppData) => {
      const next = transform(dataRef.current)
      try {
        saveAppData(next)
        setPersistenceError(null)
      } catch (error) {
        setPersistenceError(error instanceof Error ? error.message : 'This browser could not save your records.')
        throw error
      }
      dataRef.current = next
      setData(next)
    }
    return {
      data,
      persistenceError,
      addCourt(draft) {
        let createdId = ''
        update((current) => {
          const name = draft.name.trim()
          if (!name) throw new Error('Enter a court name.')
          const duplicate = current.courts.some((court) => court.name.trim().toLowerCase() === name.toLowerCase())
          if (duplicate) throw new Error('A court with this name already exists.')
          const hourlyRateCents = Math.max(0, Math.trunc(draft.hourlyRateCents))
          if (!Number.isSafeInteger(hourlyRateCents) || hourlyRateCents <= 0) throw new Error('Enter an hourly rate greater than zero.')
          const court = { id: makeId('court'), name, hourlyRateCents, status: draft.status }
          createdId = court.id
          return { ...current, courts: [...current.courts, court] }
        })
        return createdId
      },
      addSession(draft) {
        let createdId = ''
        update((current) => {
          const court = current.courts.find((item) => item.id === draft.courtId)
          if (!court) throw new Error('Select an existing court before creating a session.')
          const session: CourtSession = {
            id: makeId('session'), courtId: court.id, sessionDate: draft.sessionDate,
            startTime: draft.startTime, endTime: draft.endTime,
            hourlyRateCents: Math.max(0, Math.trunc(draft.hourlyRateCents)), status: 'scheduled',
            notes: draft.notes.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finalizedAt: null,
          }
          const conflict = checkCourtConflict(current, session)
          if (conflict) throw new Error(conflict)
          createdId = session.id
          return { ...current, sessions: [session, ...current.sessions] }
        })
        return createdId
      },
      editSession(sessionId, changes) {
        update((current) => {
          const old = current.sessions.find((session) => session.id === sessionId)
          if (!old) throw new Error('Session not found.')
          if (old.finalizedAt) throw new Error('Finalized sessions are locked. Use an authorized adjustment instead.')
          const courtId = changes.courtId ?? old.courtId
          const court = current.courts.find((item) => item.id === courtId)
          if (!court) throw new Error('Select an existing court before updating this session.')
          const session: CourtSession = {
            ...old,
            courtId,
            ...(changes.sessionDate !== undefined ? { sessionDate: changes.sessionDate } : {}),
            ...(changes.startTime !== undefined ? { startTime: changes.startTime } : {}),
            ...(changes.endTime !== undefined ? { endTime: changes.endTime } : {}),
            ...(changes.hourlyRateCents !== undefined ? { hourlyRateCents: Math.max(0, Math.trunc(changes.hourlyRateCents)) } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes.trim() } : {}),
            updatedAt: new Date().toISOString(),
          }
          const conflict = checkCourtConflict(current, session)
          if (conflict) throw new Error(conflict)
          return { ...current, sessions: current.sessions.map((item) => item.id === sessionId ? session : item) }
        })
      },
      setSessionStatus(sessionId, status) {
        update((current) => {
          const session = current.sessions.find((item) => item.id === sessionId)
          if (!session) throw new Error('Session not found.')
          if (session.finalizedAt) throw new Error('Finalized sessions cannot be changed.')
          const playerIds = new Set(current.sessionPlayers.filter((player) => player.sessionId === sessionId).map((player) => player.id))
          if (status !== 'active' && current.timeLogs.some((log) => playerIds.has(log.sessionPlayerId) && !log.timeOut)) {
            throw new Error('Time out every playing player before changing the session status.')
          }
          return { ...current, sessions: current.sessions.map((item) => item.id === sessionId
            ? { ...item, status, updatedAt: new Date().toISOString() } : item) }
        })
      },
      deleteSession(sessionId) {
        update((current) => {
          const session = current.sessions.find((item) => item.id === sessionId)
          if (!session) return current
          if (session.finalizedAt) throw new Error('Finalized sessions cannot be deleted.')
          const playerIds = new Set(current.sessionPlayers.filter((item) => item.sessionId === sessionId).map((item) => item.id))
          if (current.payments.some((payment) => playerIds.has(payment.sessionPlayerId))) {
            throw new Error('This session has payment history. Keep it for accurate records instead of deleting it.')
          }
          return {
            ...current,
            sessions: current.sessions.filter((item) => item.id !== sessionId),
            sessionPlayers: current.sessionPlayers.filter((item) => item.sessionId !== sessionId),
            timeLogs: current.timeLogs.filter((log) => !playerIds.has(log.sessionPlayerId)),
          }
        })
      },
      addPlayerToSession(draft) {
        let createdId = ''
        update((current) => {
          const session = current.sessions.find((item) => item.id === draft.sessionId)
          if (!session) throw new Error('Session not found.')
          if (session.finalizedAt || session.status === 'completed' || session.status === 'cancelled') throw new Error('Players cannot be added to a closed session.')
          const name = draft.name.trim()
          if (!name) throw new Error('Enter the player name.')
          const duplicate = current.sessionPlayers.some((item) => item.sessionId === draft.sessionId
            && current.players.find((player) => player.id === item.playerId)?.name.toLowerCase() === name.toLowerCase())
          if (duplicate) throw new Error('This player is already registered for the session.')
          const contactNumber = (draft.contactNumber ?? '').trim()
          const existing = current.players.find((player) => player.name.toLowerCase() === name.toLowerCase()
            && player.contactNumber === contactNumber)
          const player = existing ?? { id: makeId('player'), name, contactNumber, createdAt: new Date().toISOString() }
          const link: SessionPlayer = {
            id: makeId('session-player'), sessionId: draft.sessionId, playerId: player.id,
            notes: (draft.notes ?? '').trim(), createdAt: new Date().toISOString(),
          }
          createdId = link.id
          return {
            ...current, players: existing ? current.players : [...current.players, player],
            sessionPlayers: [...current.sessionPlayers, link],
          }
        })
        return createdId
      },
      editPlayer(sessionPlayerId, changes) {
        update((current) => {
          const link = current.sessionPlayers.find((item) => item.id === sessionPlayerId)
          const session = link ? current.sessions.find((item) => item.id === link.sessionId) : null
          if (!link || !session) throw new Error('Player registration not found.')
          if (session.finalizedAt) throw new Error('Players in finalized sessions cannot be edited.')
          const name = changes.name.trim()
          if (!name) throw new Error('Enter the player name.')
          const duplicate = current.sessionPlayers.some((item) => item.id !== sessionPlayerId && item.sessionId === link.sessionId
            && current.players.find((player) => player.id === item.playerId)?.name.toLowerCase() === name.toLowerCase())
          if (duplicate) throw new Error('Another player with that name is already registered for this session.')
          return {
            ...current,
            players: current.players.map((player) => player.id === link.playerId
              ? { ...player, name, contactNumber: changes.contactNumber.trim() } : player),
            sessionPlayers: current.sessionPlayers.map((item) => item.id === sessionPlayerId ? { ...item, notes: changes.notes.trim() } : item),
          }
        })
      },
      removePlayerFromSession(sessionPlayerId) {
        update((current) => {
          const link = current.sessionPlayers.find((item) => item.id === sessionPlayerId)
          if (!link) return current
          const session = current.sessions.find((item) => item.id === link.sessionId)
          if (session?.finalizedAt) throw new Error('Players cannot be removed from finalized sessions.')
          if (current.payments.some((payment) => payment.sessionPlayerId === sessionPlayerId)) {
            throw new Error('This player has payment history. Preserve it and use a reason-recorded adjustment instead.')
          }
          return {
            ...current,
            sessionPlayers: current.sessionPlayers.filter((item) => item.id !== sessionPlayerId),
            timeLogs: current.timeLogs.filter((log) => log.sessionPlayerId !== sessionPlayerId),
          }
        })
      },
      timeIn(sessionPlayerId) {
        const now = new Date()
        let createdId = ''
        update((current) => {
          const link = current.sessionPlayers.find((item) => item.id === sessionPlayerId)
          const session = link ? current.sessions.find((item) => item.id === link.sessionId) : null
          if (!link || !session) throw new Error('Player registration not found.')
          if (session.status !== 'active' || session.finalizedAt) throw new Error('Set the session to Active before recording Time In.')
          if (current.timeLogs.some((log) => log.sessionPlayerId === sessionPlayerId && !log.timeOut)) throw new Error('This player already has an active Time In.')
          const log: PlayerTimeLog = { id: makeId('time'), sessionPlayerId, timeIn: now.toISOString(), timeOut: null, durationMinutes: 0 }
          const error = validateTimeLog(log, session, current.timeLogs.filter((item) => item.sessionPlayerId === sessionPlayerId))
          if (error) throw new Error(error)
          createdId = log.id
          return { ...current, timeLogs: [...current.timeLogs, log] }
        })
        return createdId
      },
      timeOut(sessionPlayerId) {
        const now = new Date()
        update((current) => {
          const active = current.timeLogs.find((log) => log.sessionPlayerId === sessionPlayerId && !log.timeOut)
          if (!active) throw new Error('There is no active Time In for this player.')
          const link = current.sessionPlayers.find((item) => item.id === sessionPlayerId)
          const session = link ? current.sessions.find((item) => item.id === link.sessionId) : null
          if (!session) throw new Error('Session not found.')
          const scheduledEnd = new Date(`${session.sessionDate}T${session.endTime}:00`)
          if (!Number.isFinite(scheduledEnd.getTime())) throw new Error('The session end time is invalid.')
          const timeOutAt = new Date(Math.min(now.getTime(), scheduledEnd.getTime()))
          if (timeOutAt.getTime() <= new Date(active.timeIn).getTime()) throw new Error('This player’s Time In is not before the session end.')
          const candidate = { ...active, timeOut: timeOutAt.toISOString() }
          const error = validateTimeLog(candidate, session, current.timeLogs.filter((item) => item.sessionPlayerId === sessionPlayerId), active.id)
          if (error) throw new Error(error)
          return { ...current, timeLogs: current.timeLogs.map((item) => item.id === active.id
            ? { ...candidate, durationMinutes: intervalDurationMinutes(candidate.timeIn, candidate.timeOut) } : item) }
        })
      },
      confirmPlayerScan(sessionId, playerId) {
        const now = new Date()
        let result: ScanCheckInResult | null = null
        update((current) => {
          const session = current.sessions.find((item) => item.id === sessionId)
          if (!session) throw new Error('Session not found.')
          if (session.finalizedAt) throw new Error('This session is finalized. Time records are locked.')
          if (session.status !== 'active') throw new Error('Set the session to Active before recording QR check-ins.')

          const player = current.players.find((item) => item.id === playerId)
          if (!player) throw new Error('Scanned player was not found. Generate and scan a valid player QR code.')

          let sessionPlayer = current.sessionPlayers.find((item) => item.sessionId === sessionId && item.playerId === playerId)
          let sessionPlayers = current.sessionPlayers
          let registeredNow = false
          if (!sessionPlayer) {
            sessionPlayer = {
              id: makeId('session-player'),
              sessionId,
              playerId,
              notes: '',
              createdAt: new Date().toISOString(),
            }
            sessionPlayers = [...current.sessionPlayers, sessionPlayer]
            registeredNow = true
          }

          const playerLogs = current.timeLogs.filter((item) => item.sessionPlayerId === sessionPlayer!.id)
          const activeLog = playerLogs.find((item) => !item.timeOut)

          if (activeLog) {
            const scheduledEnd = new Date(`${session.sessionDate}T${session.endTime}:00`)
            if (!Number.isFinite(scheduledEnd.getTime())) throw new Error('The session end time is invalid.')
            const timeOutAt = new Date(Math.min(now.getTime(), scheduledEnd.getTime()))
            if (timeOutAt.getTime() <= new Date(activeLog.timeIn).getTime()) throw new Error('This player’s Time In is not before the session end.')
            const candidate = { ...activeLog, timeOut: timeOutAt.toISOString() }
            const error = validateTimeLog(candidate, session, playerLogs, activeLog.id)
            if (error) throw new Error(error)
            result = {
              sessionPlayerId: sessionPlayer.id,
              playerId,
              playerName: player.name,
              action: 'time_out',
              registeredNow,
            }
            return {
              ...current,
              sessionPlayers,
              timeLogs: current.timeLogs.map((item) => item.id === activeLog.id
                ? { ...candidate, durationMinutes: intervalDurationMinutes(candidate.timeIn, candidate.timeOut) }
                : item),
            }
          }

          const log: PlayerTimeLog = {
            id: makeId('time'),
            sessionPlayerId: sessionPlayer.id,
            timeIn: now.toISOString(),
            timeOut: null,
            durationMinutes: 0,
          }
          const error = validateTimeLog(log, session, playerLogs)
          if (error) throw new Error(error)
          result = {
            sessionPlayerId: sessionPlayer.id,
            playerId,
            playerName: player.name,
            action: 'time_in',
            registeredNow,
          }
          return { ...current, sessionPlayers, timeLogs: [...current.timeLogs, log] }
        })
        if (!result) throw new Error('The scan could not be completed.')
        return result
      },
      editTimeLog(logId, timeIn, timeOut) {
        update((current) => {
          const old = current.timeLogs.find((log) => log.id === logId)
          if (!old) throw new Error('Time record not found.')
          const link = current.sessionPlayers.find((item) => item.id === old.sessionPlayerId)
          const session = link ? current.sessions.find((item) => item.id === link.sessionId) : null
          if (!session || session.finalizedAt) throw new Error('Time records in finalized sessions cannot be edited.')
          const candidate = { ...old, timeIn, timeOut }
          const error = validateTimeLog(candidate, session, current.timeLogs.filter((item) => item.sessionPlayerId === old.sessionPlayerId), old.id)
          if (error) throw new Error(error)
          return { ...current, timeLogs: current.timeLogs.map((item) => item.id === logId
            ? { ...candidate, durationMinutes: intervalDurationMinutes(timeIn, timeOut) } : item) }
        })
      },
      recordPayment(sessionPlayerId, amountCents, method, notes) {
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Enter a payment amount greater than zero.')
        update((current) => {
          const link = current.sessionPlayers.find((item) => item.id === sessionPlayerId)
          const session = link ? current.sessions.find((item) => item.id === link.sessionId) : null
          if (!link || !session) throw new Error('Player registration not found.')
          if (session.status === 'cancelled') throw new Error('Payments cannot be recorded for a cancelled session.')
          if (!current.settings.paymentMethods.includes(method)) throw new Error('This payment method is disabled in Settings.')
          const now = new Date().toISOString()
          const payments = [...current.payments, {
            id: makeId('payment'), sessionPlayerId, amountCents, paymentMethod: method, paymentDate: now,
            notes: notes.trim(), kind: 'collection' as const, createdAt: now,
          }]
          const next = { ...current, payments }
          return { ...next, reports: upsertReportSnapshot(next, session.id) }
        })
      },
      recordAdjustment(sessionPlayerId, amountCents, method, reason) {
        if (!Number.isSafeInteger(amountCents) || amountCents === 0) throw new Error('An adjustment amount cannot be zero.')
        if (!reason.trim()) throw new Error('Enter a reason for this payment adjustment.')
        update((current) => {
          const registration = current.sessionPlayers.find((item) => item.id === sessionPlayerId)
          if (!registration) throw new Error('Player registration not found.')
          const now = new Date().toISOString()
          const payments = [...current.payments, {
            id: makeId('adjustment'), sessionPlayerId, amountCents, paymentMethod: method,
            paymentDate: now, notes: reason.trim(), correctionReason: reason.trim(), kind: 'adjustment' as const, createdAt: now,
          }]
          const next = { ...current, payments }
          return { ...next, reports: upsertReportSnapshot(next, registration.sessionId) }
        })
      },
      finalizeSession(sessionId) {
        update((current) => {
          const session = current.sessions.find((item) => item.id === sessionId)
          if (!session) throw new Error('Session not found.')
          const players = current.sessionPlayers.filter((item) => item.sessionId === sessionId)
          const ids = new Set(players.map((item) => item.id))
          const logs = current.timeLogs.filter((item) => ids.has(item.sessionPlayerId))
          const payments = current.payments.filter((item) => ids.has(item.sessionPlayerId))
          const summary = buildCollectionSummary(session, players, logs, payments)
          const result = canFinalizeSession(session, players, logs, summary)
          if (!result.allowed) throw new Error(result.reason ?? 'This session cannot be finalized.')
          const now = new Date().toISOString()
          const next = { ...current, sessions: current.sessions.map((item) => item.id === sessionId
            ? { ...item, finalizedAt: now, updatedAt: now } : item) }
          return { ...next, reports: upsertReportSnapshot(next, sessionId) }
        })
      },
      saveSettings(settings: AppSettings) {
        update((current) => ({ ...current, settings }))
      },
      resetSampleData() {
        const sample = createSeedData()
        try {
          saveAppData(sample)
          setPersistenceError(null)
        } catch (error) {
          setPersistenceError(error instanceof Error ? error.message : 'This browser could not save your records.')
          throw error
        }
        dataRef.current = sample
        setData(sample)
      },
    }
  }, [data, persistenceError])

  return <AppStateContext.Provider value={actions}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext)
  if (!context) throw new Error('useAppState must be used inside AppStateProvider.')
  return context
}
