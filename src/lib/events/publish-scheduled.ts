import type { SupabaseClient } from '@supabase/supabase-js'
import { checkPublishGate, hasPaidTier } from './publish-gate'

/**
 * Publish the events whose scheduled time has arrived.
 *
 * WHY THIS EXISTS. The organiser wizard has always offered "schedule for
 * later": `createEvent` and `updateEvent` accept `status: 'scheduled'` and
 * write `scheduled_publish_at`. NOTHING in the repository ever read that
 * column to publish anything. No cron, no job, no trigger. An organiser who
 * scheduled their event for Friday got an event that never went live, sold
 * nothing, and appeared nowhere, and they found out on Friday when nobody
 * turned up.
 *
 * Zero events were stranded on production when this was found, so nobody has
 * been harmed. The first organiser to use the feature was guaranteed to be.
 *
 * THE GATE IS RE-RUN AT PUBLISH TIME, NOT TRUSTED FROM SCHEDULING TIME. An
 * event can be scheduled today and go live in three weeks, and in between the
 * organisation's Stripe account can lose `charges_enabled`, payouts can be
 * restricted, or the cover image can be removed. Publishing a paid event that
 * cannot take payment is worse than not publishing it: the buyer meets a
 * broken checkout instead of the organiser meeting a clear message. A blocked
 * event is left `scheduled` with its reason recorded, never silently dropped
 * and never half-published.
 *
 * Pure of I/O beyond the client it is handed, so the cron route stays thin and
 * this stays testable.
 */

export interface ScheduledPublishOutcome {
  eventId: string
  slug: string
  title: string
  /** published: it is now live. blocked: the gate refused, it stays scheduled. */
  result: 'published' | 'blocked' | 'error'
  reason?: string
}

export interface PublishScheduledSummary {
  considered: number
  published: number
  blocked: number
  errored: number
  outcomes: ScheduledPublishOutcome[]
}

/** The privileged client. Deliberately the loose SupabaseClient shape, the
 * same one checkPublishGate takes, so this module never imports the admin
 * client and stays testable with an injected stub. */
type Client = SupabaseClient

/** Bound one run so a backlog can never run away. */
const MAX_PER_RUN = 100

export async function publishScheduledEvents(
  admin: Client,
  now: Date,
): Promise<PublishScheduledSummary> {
  const summary: PublishScheduledSummary = {
    considered: 0,
    published: 0,
    blocked: 0,
    errored: 0,
    outcomes: [],
  }

  const { data, error } = await admin
    .from('events')
    .select(
      'id, slug, title, organisation_id, cover_image_url, scheduled_publish_at, ticket_tiers(price)',
    )
    .eq('status', 'scheduled')
    .not('scheduled_publish_at', 'is', null)
    .lte('scheduled_publish_at', now.toISOString())
    .order('scheduled_publish_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    summary.errored = 1
    summary.outcomes.push({
      eventId: '-',
      slug: '-',
      title: '-',
      result: 'error',
      reason: `query failed: ${error.message}`,
    })
    return summary
  }

  type Row = {
    id: string
    slug: string
    title: string
    organisation_id: string
    cover_image_url: string | null
    scheduled_publish_at: string
    ticket_tiers: { price: number }[] | null
  }

  const rows = (data ?? []) as Row[]
  summary.considered = rows.length

  for (const event of rows) {
    const gate = await checkPublishGate(admin, {
      organisationId: event.organisation_id,
      tiersHavePaid: hasPaidTier(event.ticket_tiers ?? []),
      coverImageUrl: event.cover_image_url,
    })

    if (!gate.ok) {
      summary.blocked += 1
      summary.outcomes.push({
        eventId: event.id,
        slug: event.slug,
        title: event.title,
        result: 'blocked',
        reason: gate.reason,
      })
      continue
    }

    const at = now.toISOString()
    const { error: updateError } = await admin
      .from('events')
      .update({ status: 'published', published_at: at, updated_at: at })
      // Guard against a concurrent run or a manual publish landing first: the
      // row must still be scheduled for this update to apply.
      .eq('id', event.id)
      .eq('status', 'scheduled')

    if (updateError) {
      summary.errored += 1
      summary.outcomes.push({
        eventId: event.id,
        slug: event.slug,
        title: event.title,
        result: 'error',
        reason: updateError.message,
      })
      continue
    }

    summary.published += 1
    summary.outcomes.push({
      eventId: event.id,
      slug: event.slug,
      title: event.title,
      result: 'published',
    })
  }

  return summary
}
