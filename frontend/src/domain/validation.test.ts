import { describe, expect, it } from 'vitest'
import { intervalDurationMinutes, totalPlayerMinutes } from './calculations'
import { validateTimeLog } from './validation'
import type { CourtSession, PlayerTimeLog } from './models'

const session: CourtSession = {
  id: 's', courtId: 'c', sessionDate: '2025-02-03', startTime: '15:00', endTime: '22:00',
  hourlyRateCents: 20_000, status: 'completed', notes: '', createdAt: '', updatedAt: '', finalizedAt: null,
}

describe('player time intervals', () => {
  it('calculates duration and sums multiple valid intervals', () => {
    const logs: PlayerTimeLog[] = [
      { id: '1', sessionPlayerId: 'sp', timeIn: '2025-02-03T15:00:00', timeOut: '2025-02-03T16:00:00', durationMinutes: 60 },
      { id: '2', sessionPlayerId: 'sp', timeIn: '2025-02-03T17:00:00', timeOut: '2025-02-03T18:30:00', durationMinutes: 90 },
    ]
    expect(intervalDurationMinutes(logs[0].timeIn, logs[0].timeOut)).toBe(60)
    expect(totalPlayerMinutes('sp', logs)).toBe(150)
  })

  it('rejects intervals before or beyond the court session', () => {
    expect(validateTimeLog(
      { timeIn: '2025-02-03T14:59:00', timeOut: '2025-02-03T15:20:00' }, session, [],
    )).toContain('within the court session')
    expect(validateTimeLog(
      { timeIn: '2025-02-03T21:00:00', timeOut: '2025-02-03T22:01:00' }, session, [],
    )).toContain('within the court session')
  })

  it('rejects an interval that overlaps another interval for the same player', () => {
    const existing: PlayerTimeLog[] = [
      { id: 'first', sessionPlayerId: 'sp', timeIn: '2025-02-03T15:00:00', timeOut: '2025-02-03T16:00:00', durationMinutes: 60 },
    ]
    expect(validateTimeLog(
      { timeIn: '2025-02-03T15:30:00', timeOut: '2025-02-03T16:30:00' }, session, existing,
    )).toContain('overlaps')
    expect(validateTimeLog(
      { timeIn: '2025-02-03T16:00:00', timeOut: '2025-02-03T17:00:00' }, session, existing,
    )).toBeNull()
  })

  it('rejects an interval with an end that is not after its start', () => {
    expect(validateTimeLog(
      { timeIn: '2025-02-03T16:00:00', timeOut: '2025-02-03T15:59:00' }, session, [],
    )).toContain('after Time In')
  })
})
