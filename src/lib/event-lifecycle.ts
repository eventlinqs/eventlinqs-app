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

export function getAllowedTransitions(from: EventStatus): EventStatus[] {
  return ALLOWED_TRANSITIONS[from]
}

export function isTerminalState(status: EventStatus): boolean {
  return status === 'cancelled' || status === 'completed'
}
