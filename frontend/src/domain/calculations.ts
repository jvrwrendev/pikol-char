import type {
  CollectionSummary,
  CourtSession,
  Payment,
  PaymentStatus,
  PlayerAllocationInput,
  PlayerFinance,
  PlayerTimeLog,
  SessionPlayer,
} from './models'

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function sessionDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  return start === null || end === null || end <= start ? 0 : end - start
}

export function calculateRentalCents(durationMinutes: number, hourlyRateCents: number): number {
  if (!Number.isFinite(durationMinutes) || !Number.isFinite(hourlyRateCents)) return 0
  if (durationMinutes <= 0 || hourlyRateCents <= 0) return 0
  return Math.round((Math.trunc(durationMinutes) * Math.trunc(hourlyRateCents)) / 60)
}

export function intervalDurationMinutes(timeIn: string, timeOut: string | null, now = new Date()): number {
  const start = new Date(timeIn).getTime()
  const finish = timeOut ? new Date(timeOut).getTime() : now.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) return 0
  return Math.floor((finish - start) / 60_000)
}

export function totalPlayerMinutes(
  sessionPlayerId: string,
  timeLogs: PlayerTimeLog[],
  now = new Date(),
): number {
  return timeLogs
    .filter((log) => log.sessionPlayerId === sessionPlayerId)
    .reduce((total, log) => total + intervalDurationMinutes(log.timeIn, log.timeOut, now), 0)
}

/** Allocate integer centavos by largest remainder; ties break by stable session-player ID. */
export function allocateRentalCents(
  totalRentalCents: number,
  inputs: PlayerAllocationInput[],
): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(inputs.map((input) => [input.sessionPlayerId, 0]))
  const rent = Math.max(0, Math.trunc(totalRentalCents))
  const eligible = inputs.filter((input) => Number.isFinite(input.minutes) && input.minutes > 0)
  const totalMinutes = eligible.reduce((sum, input) => sum + Math.trunc(input.minutes), 0)
  if (rent === 0 || totalMinutes === 0) return result

  const rentBig = BigInt(rent)
  const minutesBig = BigInt(totalMinutes)
  const shares = eligible.map((input) => {
    const numerator = rentBig * BigInt(Math.trunc(input.minutes))
    const floor = numerator / minutesBig
    return {
      id: input.sessionPlayerId,
      cents: Number(floor),
      remainder: numerator % minutesBig,
    }
  })
  const centsAssigned = shares.reduce((sum, share) => sum + share.cents, 0)
  let residual = rent - centsAssigned
  shares.sort((left, right) => {
    if (left.remainder === right.remainder) return left.id.localeCompare(right.id)
    return left.remainder > right.remainder ? -1 : 1
  })
  for (let index = 0; residual > 0; index += 1, residual -= 1) {
    shares[index % shares.length].cents += 1
  }
  for (const share of shares) result[share.id] = share.cents
  return result
}

export function playerPaymentStatus(amountDueCents: number, amountPaidCents: number): PaymentStatus {
  if (amountDueCents <= 0) return 'not_charged'
  if (amountPaidCents >= amountDueCents) return 'paid'
  if (amountPaidCents > 0) return 'partially_paid'
  return 'unpaid'
}

export function buildCollectionSummary(
  session: CourtSession,
  sessionPlayers: SessionPlayer[],
  timeLogs: PlayerTimeLog[],
  payments: Payment[],
  now = new Date(),
): CollectionSummary {
  const scheduledEnd = new Date(`${session.sessionDate}T${session.endTime}:00`)
  const boundedNow = Number.isFinite(scheduledEnd.getTime()) && now.getTime() > scheduledEnd.getTime() ? scheduledEnd : now
  const inputs = sessionPlayers.map((player) => ({
    sessionPlayerId: player.id,
    minutes: totalPlayerMinutes(player.id, timeLogs, boundedNow),
  }))
  const totalPlayerMinutesValue = inputs.reduce((sum, item) => sum + item.minutes, 0)
  const totalRentalCents = calculateRentalCents(sessionDurationMinutes(session.startTime, session.endTime), session.hourlyRateCents)
  const allocations = allocateRentalCents(totalRentalCents, inputs)
  const players: PlayerFinance[] = sessionPlayers.map((player) => {
    const amountDueCents = allocations[player.id] ?? 0
    const amountPaidCents = payments
      .filter((payment) => payment.sessionPlayerId === player.id)
      .reduce((sum, payment) => sum + payment.amountCents, 0)
    return {
      sessionPlayerId: player.id,
      minutes: inputs.find((item) => item.sessionPlayerId === player.id)?.minutes ?? 0,
      amountDueCents,
      amountPaidCents,
      remainingBalanceCents: amountDueCents - amountPaidCents,
      paymentStatus: playerPaymentStatus(amountDueCents, amountPaidCents),
    }
  })
  const totalAmountDueCents = players.reduce((sum, player) => sum + player.amountDueCents, 0)
  const totalCollectedCents = players.reduce((sum, player) => sum + player.amountPaidCents, 0)
  const sharedHourlyRateCents = totalPlayerMinutesValue > 0
    ? (totalRentalCents * 60) / totalPlayerMinutesValue
    : 0
  return {
    totalRentalCents,
    totalAmountDueCents,
    totalCollectedCents,
    outstandingBalanceCents: Math.max(0, totalAmountDueCents - totalCollectedCents),
    paidPlayers: players.filter((player) => player.paymentStatus === 'paid').length,
    unpaidPlayers: players.filter((player) => player.paymentStatus === 'unpaid' || player.paymentStatus === 'partially_paid').length,
    totalPlayerMinutes: totalPlayerMinutesValue,
    sharedHourlyRateCents,
    players,
  }
}

export function liquidationStatus(totalCollectedCents: number, totalRentalCents: number): 'fully_liquidated' | 'pending_collection' {
  return totalCollectedCents >= totalRentalCents ? 'fully_liquidated' : 'pending_collection'
}

export function canFinalizeSession(
  session: CourtSession,
  sessionPlayers: SessionPlayer[],
  timeLogs: PlayerTimeLog[],
  summary: CollectionSummary,
): { allowed: boolean; reason?: string } {
  if (session.finalizedAt) return { allowed: false, reason: 'This session is already finalized.' }
  if (session.status !== 'completed') return { allowed: false, reason: 'Complete the session before finalizing it.' }
  const playerIds = new Set(sessionPlayers.map((player) => player.id))
  if (timeLogs.some((log) => playerIds.has(log.sessionPlayerId) && !log.timeOut)) {
    return { allowed: false, reason: 'Close every active player interval before finalizing.' }
  }
  if (summary.totalPlayerMinutes <= 0 || summary.totalAmountDueCents !== summary.totalRentalCents) {
    return { allowed: false, reason: 'A complete proportional allocation is required before finalizing.' }
  }
  return { allowed: true }
}
