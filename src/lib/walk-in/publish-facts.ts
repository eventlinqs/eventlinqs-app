import { resolveZone } from '@/lib/dates/event-time'
import { isWalkIn } from '@/lib/events/entry-mode'
import type { WalkInPublishFacts } from '@/lib/events/publish-gate'
import { parseGuide } from './guide'

/**
 * The walk-in facts the publish gate judges, from what a caller already read.
 *
 * Every publish path (create, edit, the Publish button, restore and the
 * scheduled-publish cron) reaches `checkPublishGate` through this, so the rule
 * for turning a row into facts exists once. A ticketed event gives `null`.
 *
 * FAILS CLOSED. A guide that is missing or cannot be parsed gives NO days, and
 * the gate then refuses with "Add the hours for each day", which is true: an
 * unreadable guide is not a guide anyone can come to the event by.
 */
export function walkInFactsFromRow(row: {
  entry_mode?: string | null
  start_date: string
  end_date: string
  timezone: string | null
  tierCount: number
  /** `event_guides.days` as read, or null when there is no guide row. */
  guideDays: unknown
}): WalkInPublishFacts | null {
  if (!isWalkIn(row)) return null
  const parsed = parseGuide({ days: row.guideDays ?? [] })
  return {
    tierCount: row.tierCount,
    days: parsed.ok ? parsed.guide.days : [],
    startsAt: row.start_date,
    endsAt: row.end_date,
    // events.timezone is NOT NULL; resolveZone is the platform's one fallback.
    timezone: resolveZone(row.timezone),
  }
}

/**
 * The guide's days from an embedded `event_guides(days)` select. PostgREST
 * returns a one-to-one embed as an object, but a caller typed for the general
 * case may hand an array, so both are read.
 */
export function embeddedGuideDays(embed: unknown): unknown {
  if (Array.isArray(embed)) return (embed[0] as { days?: unknown } | undefined)?.days ?? null
  if (embed && typeof embed === 'object') return (embed as { days?: unknown }).days ?? null
  return null
}
