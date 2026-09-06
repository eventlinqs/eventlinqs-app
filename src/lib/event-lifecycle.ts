import { Constants, type EventStatus } from '@/types/database'

/**
 * THE EVENT LIFECYCLE, AS THE CODE HOLDS IT. The authority in prose is
 * docs/EVENT-LIFECYCLE.md; this file is its executable twin and the two are
 * held together by scripts/guards/event-lifecycle-total.mjs.
 *
 * WHAT WAS WRONG BEFORE 6 September 2026 (close-out C13). `cancelled: []` and
 * `completed: []` were dead ends: once an event was cancelled the organiser
 * could edit, view or duplicate it for ever and nothing else. There was no
 * archive at all, and delete existed only for drafts, decided by the interface.
 * The founder found it on production.
 *
 * THE RULES, so nobody re-derives them:
 *
 *   - Every status can be ARCHIVED (organiser or admin). Archived is a real
 *     enum value (migration 20260906000001), which is why every public surface
 *     excludes it without a line of new code: they all filter on published.
 *   - Archived leaves ONLY by RESTORE, to the exact status it came from
 *     (events.archived_from_status). Restoring to published re-runs the publish
 *     gate in the action; there is no side door to live.
 *   - DELETE is not a transition in this table. It is legal from every status
 *     and the DATABASE decides whether it may happen (the money-records trigger
 *     in 20260906000002). See src/lib/events/delete-eligibility.ts.
 *   - No status is a dead end: `exitsOf` is non-empty for every value the
 *     database enum carries. The guard fails the build if that stops being true.
 */

/** Every status the database enum carries, in the generator's order. */
export const EVENT_STATUSES = Constants.public.Enums.event_status

export const ARCHIVED_STATUS = 'archived' satisfies EventStatus

const ALLOWED_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['scheduled', 'published', 'archived'],
  scheduled: ['published', 'draft', 'archived'],
  published: ['paused', 'postponed', 'cancelled', 'completed', 'archived'],
  paused: ['published', 'cancelled', 'archived'],
  postponed: ['published', 'cancelled', 'archived'],
  cancelled: ['archived'],
  completed: ['archived'],
  // Restore is the only way out, and it is not a fixed target: see restoreTarget.
  archived: [],
}

/** May an event move from `from` to `to` by a direct transition? */
export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** May an event in this status be archived? True for every status but archived itself. */
export function canArchive(status: EventStatus): boolean {
  return canTransition(status, ARCHIVED_STATUS)
}

/**
 * The status an archived event returns to, or null when it is not archived or
 * the record of where it came from is missing or itself says archived (the
 * database CHECK forbids both, so null here means the row is corrupt and the
 * action must refuse rather than guess).
 */
export function restoreTarget(event: {
  status: EventStatus
  archived_from_status: EventStatus | null
}): EventStatus | null {
  if (event.status !== ARCHIVED_STATUS) return null
  const from = event.archived_from_status
  if (!from || from === ARCHIVED_STATUS) return null
  if (!(EVENT_STATUSES as readonly string[]).includes(from)) return null
  return from
}

/**
 * Every way out of a status, for the totality check. Archived reports the
 * restore route by name rather than a target, because its target depends on
 * the row. Delete is deliberately not listed: it is always available subject
 * to the database, so listing it would make the check pass for the wrong
 * reason.
 */
export function exitsOf(status: EventStatus): readonly string[] {
  if (status === ARCHIVED_STATUS) return ['restore']
  return ALLOWED_TRANSITIONS[status]
}

/** A status with no transition out and no restore. There must be none. */
export function isDeadEnd(status: EventStatus): boolean {
  return exitsOf(status).length === 0
}

/** The statuses with no way out, across the whole enum. Expected: []. */
export function deadEnds(): EventStatus[] {
  return EVENT_STATUSES.filter((s) => isDeadEnd(s))
}

/** True when a status is one a ticket buyer would see as live and selling. */
export function isSelling(status: EventStatus): boolean {
  return status === 'published'
}

/** The authority document, for messages and the guard. */
export const LIFECYCLE_DOC = 'docs/EVENT-LIFECYCLE.md'
