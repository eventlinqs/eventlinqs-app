import { describe, expect, test } from 'vitest'
import {
  ARCHIVED_STATUS,
  EVENT_STATUSES,
  canArchive,
  canTransition,
  deadEnds,
  exitsOf,
  isDeadEnd,
  isSelling,
  restoreTarget,
} from '@/lib/event-lifecycle'
import type { EventStatus } from '@/types/database'

/**
 * The lifecycle table is TOTAL (docs/EVENT-LIFECYCLE.md): every status the
 * database enum carries has a way out. Before 6 September 2026 cancelled and
 * completed had none, which is the defect the founder found on production.
 */
describe('the event lifecycle is total', () => {
  test('the database enum carries archived', () => {
    expect(EVENT_STATUSES).toContain('archived')
    expect(ARCHIVED_STATUS).toBe('archived')
  })

  test('no status is a dead end', () => {
    expect(deadEnds()).toEqual([])
    for (const status of EVENT_STATUSES) {
      expect(isDeadEnd(status), `${status} has no way out`).toBe(false)
      expect(exitsOf(status).length, `${status} exits`).toBeGreaterThan(0)
    }
  })

  test('cancelled and completed, the two dead ends, now archive', () => {
    expect(canArchive('cancelled')).toBe(true)
    expect(canArchive('completed')).toBe(true)
    expect(canTransition('cancelled', 'archived')).toBe(true)
    expect(canTransition('completed', 'archived')).toBe(true)
  })

  test('every status but archived can be archived, and archived cannot archive again', () => {
    for (const status of EVENT_STATUSES) {
      expect(canArchive(status), status).toBe(status !== 'archived')
    }
  })

  test('archived leaves only by restore: no direct transition to any status', () => {
    expect(exitsOf('archived')).toEqual(['restore'])
    for (const status of EVENT_STATUSES) {
      expect(canTransition('archived', status), `archived -> ${status}`).toBe(false)
    }
  })

  test('restore is exact: the status the event came from, and nothing else', () => {
    for (const from of EVENT_STATUSES) {
      if (from === 'archived') continue
      expect(restoreTarget({ status: 'archived', archived_from_status: from })).toBe(from)
    }
  })

  test('restore refuses a corrupt or missing record of where the event came from', () => {
    expect(restoreTarget({ status: 'archived', archived_from_status: null })).toBeNull()
    expect(restoreTarget({ status: 'archived', archived_from_status: 'archived' })).toBeNull()
    expect(restoreTarget({ status: 'archived', archived_from_status: 'not-a-status' as EventStatus })).toBeNull()
    expect(restoreTarget({ status: 'published', archived_from_status: 'draft' })).toBeNull()
  })

  test('the pre-existing transitions are unchanged', () => {
    expect(canTransition('draft', 'published')).toBe(true)
    expect(canTransition('draft', 'scheduled')).toBe(true)
    expect(canTransition('scheduled', 'draft')).toBe(true)
    expect(canTransition('published', 'paused')).toBe(true)
    expect(canTransition('published', 'cancelled')).toBe(true)
    expect(canTransition('paused', 'published')).toBe(true)
    expect(canTransition('postponed', 'cancelled')).toBe(true)
    expect(canTransition('cancelled', 'published')).toBe(false)
    expect(canTransition('completed', 'published')).toBe(false)
  })

  test('only published sells', () => {
    for (const status of EVENT_STATUSES) expect(isSelling(status)).toBe(status === 'published')
  })
})
