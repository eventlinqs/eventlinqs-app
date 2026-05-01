import type { EventStatus } from '@/types/database'

const ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['scheduled', 'published'],
  scheduled: ['published', 'draft'],
  published: ['paused', 'postponed', 'cancelled', 'completed'],
  paused: ['published', 'cancelled'],
  postponed: ['published', 'cancelled'],
  cancelled: [],
  completed: [],
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}
