import { describe, expect, it } from 'vitest'
import {
  allocateRentalCents,
  buildCollectionSummary,
  calculateRentalCents,
  liquidationStatus,
  playerPaymentStatus,
  sessionDurationMinutes,
} from './calculations'

describe('court rental calculations', () => {
  it('calculates a seven-hour rental at ₱200 per hour as 140,000 centavos', () => {
    expect(sessionDurationMinutes('15:00', '22:00')).toBe(420)
    expect(calculateRentalCents(420, 20_000)).toBe(140_000)
  })

  it('rejects zero, invalid and reversed session ranges', () => {
    expect(sessionDurationMinutes('22:00', '15:00')).toBe(0)
    expect(sessionDurationMinutes('15:00', '15:00')).toBe(0)
    expect(sessionDurationMinutes('25:00', '26:00')).toBe(0)
  })

  it('caps an open player interval and allocation at the scheduled session end', () => {
    const sessionDate = '2026-11-19'
    const session = {
      id: 's1', courtId: 'c1', sessionDate, startTime: '09:00', endTime: '11:00',
      hourlyRateCents: 12_000, status: 'active' as const, notes: '', createdAt: '', updatedAt: '', finalizedAt: null,
    }
    const player = { id: 'sp1', sessionId: 's1', playerId: 'p1', notes: '', createdAt: '' }
    const timeIn = new Date(`${sessionDate}T09:00:00`).toISOString()
    const afterEnd = new Date(`${sessionDate}T15:00:00`)
    const summary = buildCollectionSummary(session, [player], [{ id: 't1', sessionPlayerId: 'sp1', timeIn, timeOut: null, durationMinutes: 0 }], [], afterEnd)
    expect(summary.totalPlayerMinutes).toBe(120)
    expect(summary.totalAmountDueCents).toBe(summary.totalRentalCents)
    expect(summary.totalAmountDueCents).toBe(24_000)
  })
})

describe('proportional payment allocation', () => {
  it('allocates in proportion to minutes and totals exactly to the court rent', () => {
    const allocation = allocateRentalCents(14_000, [
      { sessionPlayerId: 'a', minutes: 60 },
      { sessionPlayerId: 'b', minutes: 180 },
      { sessionPlayerId: 'c', minutes: 120 },
    ])
    expect(allocation).toEqual({ a: 2_333, b: 7_000, c: 4_667 })
    expect(Object.values(allocation).reduce((sum, cents) => sum + cents, 0)).toBe(14_000)
  })

  it('assigns every rounding cent deterministically with an ID tie-break', () => {
    const entries = [
      { sessionPlayerId: 'c', minutes: 1 },
      { sessionPlayerId: 'a', minutes: 1 },
      { sessionPlayerId: 'b', minutes: 1 },
    ]
    expect(allocateRentalCents(2, entries)).toEqual({ c: 0, a: 1, b: 1 })
    expect(allocateRentalCents(2, [...entries].reverse())).toEqual({ b: 1, a: 1, c: 0 })
  })

  it('does not charge zero-minute players and never divides by zero', () => {
    expect(allocateRentalCents(1_000, [
      { sessionPlayerId: 'playing', minutes: 30 },
      { sessionPlayerId: 'waited', minutes: 0 },
    ])).toEqual({ playing: 1_000, waited: 0 })
    expect(allocateRentalCents(1_000, [{ sessionPlayerId: 'none', minutes: 0 }])).toEqual({ none: 0 })
  })

  it('derives partial, paid, unpaid and not-charged statuses', () => {
    expect(playerPaymentStatus(1_000, 0)).toBe('unpaid')
    expect(playerPaymentStatus(1_000, 500)).toBe('partially_paid')
    expect(playerPaymentStatus(1_000, 1_000)).toBe('paid')
    expect(playerPaymentStatus(0, 0)).toBe('not_charged')
  })

  it('treats exact or excess collection as fully liquidated', () => {
    expect(liquidationStatus(14_000, 14_000)).toBe('fully_liquidated')
    expect(liquidationStatus(14_001, 14_000)).toBe('fully_liquidated')
    expect(liquidationStatus(13_999, 14_000)).toBe('pending_collection')
  })
})
