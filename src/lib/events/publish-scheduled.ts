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
      'id, slug, title, organisation_id, cover_image_url, scheduled_publish_at, end_date, event_type, venue_name, venue_address, ticket_tiers(price)',
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
    // Read so the gate can refuse an event that has already ended, and an
    // in-person event with nowhere to go. Added 29 August 2026 with those rules.
    end_date: string | null
    event_type: string | null
    venue_name: string | null
    venue_address: string | null
    ticket_tiers: { price: number }[] | null
  }

  const rows = (data ?? []) as Row[]
  summary.considered = rows.length

  for (const event of rows) {
    const gate = await checkPublishGate(
      admin,
      {
        organisationId: event.organisation_id,
        tiersHavePaid: hasPaidTier(event.ticket_tiers ?? []),
        coverImageUrl: event.cover_image_url,
        endsAt: event.end_date,
        isPhysical: event.event_type !== 'virtual',
        venueName: event.venue_name,
        venueAddress: event.venue_address,
      },
      // NO STRIPE RE-READ FROM THE CRON. Deliberate, and this is a
      // MERGE-INDUCED defect being closed rather than a feature being declined.
      //
      // Nothing was dropped by the merge: two additions collided. This
      // scheduled-publish path arrived on feat/launch-kit-moat and
      // feat/public-composer, where checkPublishGate had no reconciler at all
      // and this call took two arguments. The reconciler arrived separately on
      // fix/production-sweep, for the organiser-facing Publish button, where a
      // stale column must never produce a false refusal. Merged, this cron
      // silently inherited it: it built a second privileged client per event,
      // inside a module whose header promises it never imports one, and it made
      // a live Stripe call inside a fail-closed job.
      //
      // It was also WRONG, measured not assumed: for an organisation with
      // charges enabled and payouts restricted, the reconciled path returned
      // `paid_event_charges_disabled`, which is the wrong thing to tell an
      // organiser. This cron re-reads the organisation row seconds before it
      // decides, so the staleness the reconciler exists to defeat does not
      // arise here.
      null,
    )

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
