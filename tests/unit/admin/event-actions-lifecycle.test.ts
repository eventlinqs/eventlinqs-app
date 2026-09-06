import { describe, expect, test } from 'vitest'
import { actionsForEventStatus, EVENT_ACTION_LABELS, EVENT_STATUS_FILTERS } from '@/lib/admin/events'
import { EVENT_STATUSES } from '@/lib/event-lifecycle'

/**
 * The admin console offers the same exits as the organiser (close-out C13.7
 * and C13.8): archive from every status but archived, restore from archived,
 * and the Archived filter so an archived event can be found.
 */
describe('admin event actions across the lifecycle', () => {
  test('every status has at least one action, so the console has no dead end either', () => {
    for (const status of EVENT_STATUSES) {
      expect(actionsForEventStatus(status).length, status).toBeGreaterThan(0)
    }
  })

  test('cancelled and completed offer archive', () => {
    expect(actionsForEventStatus('cancelled')).toContain('archive')
    expect(actionsForEventStatus('completed')).toContain('archive')
  })

  test('archived offers restore and only restore', () => {
    expect(actionsForEventStatus('archived')).toEqual(['restore'])
  })

  test('takedown stays off the row buttons', () => {
    for (const status of EVENT_STATUSES) expect(actionsForEventStatus(status)).not.toContain('takedown')
  })

  test('every action has a label and archived is a filter', () => {
    for (const action of ['pause', 'resume', 'cancel', 'takedown', 'archive', 'restore'] as const) {
      expect(EVENT_ACTION_LABELS[action]).toBeTruthy()
    }
    expect(EVENT_STATUS_FILTERS).toContain('archived')
  })
})
