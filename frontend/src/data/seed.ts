import { addDays, format, subDays } from 'date-fns'
import { allocateRentalCents, calculateRentalCents } from '@/domain/calculations'
import type { AppData, CourtSession, Payment, Player, PlayerTimeLog, SessionPlayer } from '@/domain/models'

const id = (name: string) => name
const localTime = (date: Date) => format(date, 'HH:mm')
const toIso = (date: Date) => new Date(date.getTime() - date.getMilliseconds()).toISOString()
const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')

function timeAt(day: Date, hour: number, minute: number): Date {
  const value = new Date(day)
  value.setHours(hour, minute, 0, 0)
  return value
}

function log(idValue: string, sessionPlayerId: string, start: Date, end: Date | null): PlayerTimeLog {
  return {
    id: id(idValue),
    sessionPlayerId,
    timeIn: toIso(start),
    timeOut: end ? toIso(end) : null,
    durationMinutes: end ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000)) : 0,
  }
}

export function createSeedData(): AppData {
  const now = new Date()
  now.setSeconds(0, 0)
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const sessionStart = new Date(Math.max(midnight.getTime(), now.getTime() - 90 * 60_000))
  const dayEnd = new Date(now)
  dayEnd.setHours(23, 59, 0, 0)
  const sessionEnd = new Date(Math.min(dayEnd.getTime(), now.getTime() + 120 * 60_000))
  if (sessionEnd.getTime() <= sessionStart.getTime()) sessionEnd.setTime(Math.min(dayEnd.getTime(), sessionStart.getTime() + 60 * 60_000))

  const today = dateKey(now)
  const yesterday = subDays(now, 1)
  const tomorrow = addDays(now, 1)
  const courts = [
    { id: 'court-1', name: 'Court 1', hourlyRateCents: 20_000, status: 'available' as const },
    { id: 'court-2', name: 'Court 2', hourlyRateCents: 18_000, status: 'available' as const },
  ]
  const historicalSession: CourtSession = {
    id: 'session-yesterday', courtId: 'court-1', sessionDate: dateKey(yesterday), startTime: '15:00', endTime: '22:00',
    hourlyRateCents: 20_000, status: 'completed', notes: 'Evening open-play group', createdAt: toIso(subDays(now, 2)), updatedAt: toIso(yesterday), finalizedAt: null,
  }
  const activeSession: CourtSession = {
    id: 'session-today', courtId: 'court-2', sessionDate: today, startTime: localTime(sessionStart), endTime: localTime(sessionEnd),
    hourlyRateCents: 18_000, status: 'active', notes: 'Walk-in doubles rotation', createdAt: toIso(sessionStart), updatedAt: toIso(now), finalizedAt: null,
  }
  const scheduledSession: CourtSession = {
    id: 'session-tomorrow', courtId: 'court-1', sessionDate: dateKey(tomorrow), startTime: '18:00', endTime: '21:00',
    hourlyRateCents: 20_000, status: 'scheduled', notes: 'Community evening booking', createdAt: toIso(now), updatedAt: toIso(now), finalizedAt: null,
  }

  const players: Player[] = [
    { id: 'player-mara', name: 'Mara Santos', contactNumber: '0917 555 0101', createdAt: toIso(yesterday) },
    { id: 'player-jules', name: 'Jules Reyes', contactNumber: '0917 555 0102', createdAt: toIso(yesterday) },
    { id: 'player-nico', name: 'Nico Dela Cruz', contactNumber: '0917 555 0103', createdAt: toIso(yesterday) },
    { id: 'player-aina', name: 'Aina Flores', contactNumber: '0917 555 0104', createdAt: toIso(yesterday) },
    { id: 'player-eli', name: 'Eli Mendoza', contactNumber: '', createdAt: toIso(now) },
    { id: 'player-bea', name: 'Bea Lim', contactNumber: '', createdAt: toIso(now) },
    { id: 'player-tony', name: 'Tony Cruz', contactNumber: '', createdAt: toIso(now) },
    { id: 'player-ria', name: 'Ria Navarro', contactNumber: '', createdAt: toIso(now) },
  ]
  const sessionPlayers: SessionPlayer[] = [
    { id: 'sp-yesterday-mara', sessionId: historicalSession.id, playerId: 'player-mara', notes: '', createdAt: toIso(yesterday) },
    { id: 'sp-yesterday-jules', sessionId: historicalSession.id, playerId: 'player-jules', notes: '', createdAt: toIso(yesterday) },
    { id: 'sp-yesterday-nico', sessionId: historicalSession.id, playerId: 'player-nico', notes: '', createdAt: toIso(yesterday) },
    { id: 'sp-yesterday-aina', sessionId: historicalSession.id, playerId: 'player-aina', notes: '', createdAt: toIso(yesterday) },
    { id: 'sp-today-eli', sessionId: activeSession.id, playerId: 'player-eli', notes: '', createdAt: toIso(now) },
    { id: 'sp-today-bea', sessionId: activeSession.id, playerId: 'player-bea', notes: '', createdAt: toIso(now) },
    { id: 'sp-today-tony', sessionId: activeSession.id, playerId: 'player-tony', notes: '', createdAt: toIso(now) },
    { id: 'sp-tomorrow-ria', sessionId: scheduledSession.id, playerId: 'player-ria', notes: '', createdAt: toIso(now) },
    { id: 'sp-tomorrow-mara', sessionId: scheduledSession.id, playerId: 'player-mara', notes: '', createdAt: toIso(now) },
  ]

  const yesterdayDay = new Date(`${historicalSession.sessionDate}T12:00:00`)
  const timeLogs: PlayerTimeLog[] = [
    log('log-y-mara', 'sp-yesterday-mara', timeAt(yesterdayDay, 15, 10), timeAt(yesterdayDay, 17, 10)),
    log('log-y-jules', 'sp-yesterday-jules', timeAt(yesterdayDay, 15, 30), timeAt(yesterdayDay, 18, 30)),
    log('log-y-nico-1', 'sp-yesterday-nico', timeAt(yesterdayDay, 16, 0), timeAt(yesterdayDay, 18, 30)),
    log('log-y-nico-2', 'sp-yesterday-nico', timeAt(yesterdayDay, 19, 30), timeAt(yesterdayDay, 22, 0)),
    log('log-y-aina', 'sp-yesterday-aina', timeAt(yesterdayDay, 17, 0), timeAt(yesterdayDay, 19, 40)),
  ]
  const completedRent = calculateRentalCents(7 * 60, historicalSession.hourlyRateCents)
  const completedAllocations = allocateRentalCents(completedRent, [
    { sessionPlayerId: 'sp-yesterday-mara', minutes: 120 },
    { sessionPlayerId: 'sp-yesterday-jules', minutes: 180 },
    { sessionPlayerId: 'sp-yesterday-nico', minutes: 300 },
    { sessionPlayerId: 'sp-yesterday-aina', minutes: 160 },
  ])
  const payments: Payment[] = []
  const paymentFractions = [1, 1, 0.5, 0]
  sessionPlayers.slice(0, 4).forEach((player, index) => {
    const cents = Math.round((completedAllocations[player.id] ?? 0) * paymentFractions[index])
    if (cents > 0) payments.push({
      id: `payment-y-${index + 1}`, sessionPlayerId: player.id, amountCents: cents,
      paymentMethod: index === 0 ? 'cash' : 'gcash', paymentDate: toIso(yesterday),
      notes: index === 2 ? 'Partial payment' : 'Session collection', kind: 'collection', createdAt: toIso(yesterday),
    })
  })

  const closedIn = new Date(Math.max(sessionStart.getTime() + 60_000, now.getTime() - 60 * 60_000))
  const closedOut = new Date(Math.min(now.getTime() - 60_000, closedIn.getTime() + 35 * 60_000))
  const activeIn = new Date(Math.max(sessionStart.getTime() + 60_000, now.getTime() - 18 * 60_000))
  if (closedOut > closedIn) timeLogs.push(log('log-t-eli', 'sp-today-eli', closedIn, closedOut))
  if (now > activeIn && activeIn < sessionEnd) timeLogs.push(log('log-t-bea', 'sp-today-bea', activeIn, null))
  const activeRent = calculateRentalCents(
    Math.max(1, Math.floor((sessionEnd.getTime() - sessionStart.getTime()) / 60_000)),
    activeSession.hourlyRateCents,
  )
  const activePlayers: SessionPlayer[] = sessionPlayers.filter((player) => player.sessionId === activeSession.id)
  const activeMinutes = activePlayers.map((player) => ({
    sessionPlayerId: player.id,
    minutes: timeLogs.filter((item) => item.sessionPlayerId === player.id).reduce((sum, item) => sum + item.durationMinutes, 0),
  }))
  const activeAllocations = allocateRentalCents(activeRent, activeMinutes)
  const eliPaid = Math.min(5_000, activeAllocations['sp-today-eli'] ?? 0)
  if (eliPaid > 0) payments.push({
    id: 'payment-t-eli', sessionPlayerId: 'sp-today-eli', amountCents: eliPaid, paymentMethod: 'cash',
    paymentDate: toIso(now), notes: 'Walk-in collection', kind: 'collection', createdAt: toIso(now),
  })

  return {
    schemaVersion: 3,
    courts,
    sessions: [activeSession, scheduledSession, historicalSession],
    players,
    sessionPlayers,
    timeLogs,
    payments,
    reports: [],
    settings: {
      systemName: 'PIKOL CHAR', defaultHourlyRateCents: 20_000, currency: 'PHP', defaultSessionMinutes: 180,
      timeFormat: '12h', dateFormat: 'MMM d, yyyy', paymentMethods: ['cash', 'gcash', 'bank_transfer', 'other'],
      calculationMethod: 'proportional_player_minutes', roundingRule: 'largest_remainder', theme: 'dark',
    },
  }
}
