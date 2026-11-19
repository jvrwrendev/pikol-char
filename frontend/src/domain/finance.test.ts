import { describe, expect, it } from 'vitest'
import { buildCollectionSummary, canFinalizeSession } from './calculations'
import type { CourtSession, Payment, PlayerTimeLog, SessionPlayer } from './models'

const session: CourtSession = {
  id: 'session', courtId: 'court', sessionDate: '2025-05-04', startTime: '15:00', endTime: '17:00',
  hourlyRateCents: 10_000, status: 'completed', notes: '', createdAt: '', updatedAt: '', finalizedAt: null,
}
const links: SessionPlayer[] = [
  { id: 'sp-a', sessionId: session.id, playerId: 'a', notes: '', createdAt: '' },
  { id: 'sp-b', sessionId: session.id, playerId: 'b', notes: '', createdAt: '' },
]
const logs: PlayerTimeLog[] = [
  { id: 'log-a', sessionPlayerId: 'sp-a', timeIn: '2025-05-04T15:00:00', timeOut: '2025-05-04T16:00:00', durationMinutes: 60 },
  { id: 'log-b', sessionPlayerId: 'sp-b', timeIn: '2025-05-04T15:00:00', timeOut: '2025-05-04T16:00:00', durationMinutes: 60 },
]

function collection(amount: number): Payment {
  return {
    id: 'payment', sessionPlayerId: 'sp-a', amountCents: amount, paymentMethod: 'cash',
    paymentDate: '2025-05-04T16:00:00', notes: '', kind: 'collection', createdAt: '',
  }
}

describe('payment collection and balances', () => {
  it('distinguishes a partial payment and calculates the exact outstanding balance', () => {
    const summary = buildCollectionSummary(session, links, logs, [collection(5_000)])
    expect(summary.totalRentalCents).toBe(20_000)
    expect(summary.totalAmountDueCents).toBe(20_000)
    expect(summary.totalCollectedCents).toBe(5_000)
    expect(summary.outstandingBalanceCents).toBe(15_000)
    expect(summary.players.find((player) => player.sessionPlayerId === 'sp-a')).toMatchObject({
      amountDueCents: 10_000, amountPaidCents: 5_000, remainingBalanceCents: 5_000, paymentStatus: 'partially_paid',
    })
    expect(summary.players.find((player) => player.sessionPlayerId === 'sp-b')?.paymentStatus).toBe('unpaid')
  })

  it('supports immutable adjustments and reports overpayment as a credit', () => {
    const correction: Payment = { ...collection(-2_000), id: 'adjustment', kind: 'adjustment', correctionReason: 'Corrected duplicate collection' }
    const summary = buildCollectionSummary(session, links, logs, [collection(12_000), correction])
    const player = summary.players.find((item) => item.sessionPlayerId === 'sp-a')
    expect(player?.amountPaidCents).toBe(10_000)
    expect(player?.remainingBalanceCents).toBe(0)
    expect(summary.totalCollectedCents).toBe(10_000)
    expect(summary.outstandingBalanceCents).toBe(10_000)
  })
})

describe('session finalization rules', () => {
  it('allows a completed, fully allocated session with outstanding collection balances', () => {
    const summary = buildCollectionSummary(session, links, logs, [])
    expect(canFinalizeSession(session, links, logs, summary)).toEqual({ allowed: true })
  })

  it('requires completion and closed player intervals before finalization', () => {
    const summary = buildCollectionSummary(session, links, logs, [])
    expect(canFinalizeSession({ ...session, status: 'active' }, links, logs, summary).allowed).toBe(false)
    const activeLog: PlayerTimeLog = { id: 'open', sessionPlayerId: 'sp-a', timeIn: '2025-05-04T16:10:00', timeOut: null, durationMinutes: 0 }
    expect(canFinalizeSession(session, links, [...logs, activeLog], summary).reason).toContain('active player interval')
  })

  it('requires positive player time and a valid allocation', () => {
    const emptySummary = buildCollectionSummary(session, links, [], [])
    expect(canFinalizeSession(session, links, [], emptySummary).reason).toContain('allocation')
  })
})
