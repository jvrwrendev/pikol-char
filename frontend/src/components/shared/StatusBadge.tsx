import { Badge, type BadgeTone } from '@/components/ui/Badge'

const labels: Record<string, string> = {
  scheduled: 'Scheduled', active: 'Active', completed: 'Completed', cancelled: 'Cancelled',
  unpaid: 'Unpaid', partially_paid: 'Partially paid', paid: 'Paid', not_charged: 'Not charged',
  playing: 'Playing', waiting: 'Waiting', finished: 'Finished',
  fully_liquidated: 'Fully Liquidated', pending_collection: 'Pending Collection',
}
const tones: Record<string, BadgeTone> = {
  // Active / Playing: Electric Cyan
  active: 'info',
  playing: 'info',
  // Paid / Completed: Neon Lime Green
  paid: 'success',
  completed: 'success',
  fully_liquidated: 'success',
  // Pending: Muted Amber
  partially_paid: 'warning',
  pending_collection: 'warning',
  // Unpaid / Error: Soft Red
  unpaid: 'danger',
  cancelled: 'danger',
  // Inactive: Neutral Gray
  scheduled: 'neutral',
  waiting: 'neutral',
  finished: 'neutral',
  not_charged: 'neutral',
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={tones[status] ?? 'neutral'}>{labels[status] ?? status.replaceAll('_', ' ')}</Badge>
}
