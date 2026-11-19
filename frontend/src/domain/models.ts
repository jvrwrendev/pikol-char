export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled'
export type PlayerStatus = 'waiting' | 'playing' | 'finished'
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'not_charged'
export type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer' | 'other'
export type PaymentKind = 'collection' | 'adjustment' | 'reversal'

export interface Court {
  id: string
  name: string
  hourlyRateCents: number
  status: 'available' | 'maintenance'
}

export interface CourtSession {
  id: string
  courtId: string
  sessionDate: string
  startTime: string
  endTime: string
  hourlyRateCents: number
  status: SessionStatus
  notes: string
  createdAt: string
  updatedAt: string
  finalizedAt: string | null
}

export interface Player {
  id: string
  name: string
  contactNumber: string
  createdAt: string
}

export interface SessionPlayer {
  id: string
  sessionId: string
  playerId: string
  notes: string
  createdAt: string
}

export interface PlayerTimeLog {
  id: string
  sessionPlayerId: string
  timeIn: string
  timeOut: string | null
  durationMinutes: number
}

export interface Payment {
  id: string
  sessionPlayerId: string
  amountCents: number
  paymentMethod: PaymentMethod
  paymentDate: string
  notes: string
  kind: PaymentKind
  correctionReason?: string
  createdAt: string
}

export interface LiquidationReport {
  id: string
  sessionId: string
  totalRentalCents: number
  totalPlayerMinutes: number
  totalAmountDueCents: number
  totalCollectedCents: number
  remainingBalanceCents: number
  status: 'fully_liquidated' | 'pending_collection'
  finalizedAt: string
}

export interface AppSettings {
  systemName: string
  defaultHourlyRateCents: number
  currency: 'PHP'
  defaultSessionMinutes: number
  timeFormat: '12h' | '24h'
  dateFormat: 'MMM d, yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'
  paymentMethods: PaymentMethod[]
  calculationMethod: 'proportional_player_minutes'
  roundingRule: 'largest_remainder'
}

export interface AppData {
  schemaVersion: 2
  courts: Court[]
  sessions: CourtSession[]
  players: Player[]
  sessionPlayers: SessionPlayer[]
  timeLogs: PlayerTimeLog[]
  payments: Payment[]
  reports: LiquidationReport[]
  settings: AppSettings
}

export interface PlayerAllocationInput {
  sessionPlayerId: string
  minutes: number
}

export interface PlayerFinance {
  sessionPlayerId: string
  minutes: number
  amountDueCents: number
  amountPaidCents: number
  remainingBalanceCents: number
  paymentStatus: PaymentStatus
}

export interface CollectionSummary {
  totalRentalCents: number
  totalAmountDueCents: number
  totalCollectedCents: number
  outstandingBalanceCents: number
  paidPlayers: number
  unpaidPlayers: number
  totalPlayerMinutes: number
  sharedHourlyRateCents: number
  players: PlayerFinance[]
}
