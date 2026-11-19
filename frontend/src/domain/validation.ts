import { z } from 'zod'
import type { CourtSession, PlayerTimeLog } from './models'

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
export const sessionFormSchema = z.object({
  sessionDate: z.string().min(1, 'Choose a session date.'),
  courtId: z.string().min(1, 'Choose a court.'),
  startTime: z.string().regex(timePattern, 'Enter a valid start time.'),
  endTime: z.string().regex(timePattern, 'Enter a valid end time.'),
  hourlyRate: z.coerce.number().min(0.01, 'Rate must be greater than zero.'),
  notes: z.string().max(300, 'Notes must be 300 characters or fewer.').optional(),
}).refine((values) => values.endTime > values.startTime, {
  path: ['endTime'],
  message: 'End time must be later than start time.',
})

export const playerFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter the player name.').max(80),
  contactNumber: z.string().max(40).optional(),
  notes: z.string().max(300).optional(),
})

export const paymentFormSchema = z.object({
  amount: z.coerce.number().positive('Payment must be greater than zero.'),
  paymentMethod: z.enum(['cash', 'gcash', 'bank_transfer', 'other']),
  notes: z.string().max(300).optional(),
})

function asDate(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : NaN
}

export function sessionBounds(session: CourtSession): { start: number; end: number } {
  return {
    start: asDate(`${session.sessionDate}T${session.startTime}:00`),
    end: asDate(`${session.sessionDate}T${session.endTime}:00`),
  }
}

export function validateTimeLog(
  candidate: Pick<PlayerTimeLog, 'timeIn' | 'timeOut'>,
  session: CourtSession,
  otherLogs: PlayerTimeLog[],
  excludeLogId?: string,
): string | null {
  const start = asDate(candidate.timeIn)
  const finish = candidate.timeOut ? asDate(candidate.timeOut) : null
  const { start: sessionStart, end: sessionEnd } = sessionBounds(session)
  if (![start, sessionStart, sessionEnd].every(Number.isFinite)) return 'Session or time is invalid.'
  if (start < sessionStart || start >= sessionEnd) return 'Time In must fall within the court session.'
  if (finish !== null && (!Number.isFinite(finish) || finish <= start)) return 'Time Out must be after Time In.'
  if (finish !== null && finish > sessionEnd) return 'Time Out must fall within the court session.'

  const candidateEnd = finish ?? sessionEnd
  for (const log of otherLogs) {
    if (log.id === excludeLogId) continue
    const otherStart = asDate(log.timeIn)
    const otherEnd = log.timeOut ? asDate(log.timeOut) : sessionEnd
    if (Number.isFinite(otherStart) && Number.isFinite(otherEnd) && start < otherEnd && otherStart < candidateEnd) {
      return 'This interval overlaps another interval for this player.'
    }
  }
  return null
}
