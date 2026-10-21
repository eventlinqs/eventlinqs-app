import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { isUnsubscribeToken } from '@/lib/consent/token'
import { formatVenueWithAddress } from '@/lib/venues/format-venue-address'
import type { Database } from '@/types/database'
import { parseGuide, type GuideDay } from './guide'
import { buildReminderEmail } from './reminder-messages'
import type { DueRow, ReminderKind, ReminderSendDeps } from './reminder-sends'

/**
 * Remind me's sends, connected to the database and the mail transport (WI1).
 * The rules are in reminder-sends.ts; this file only reads and writes.
 *
 * SERVICE ROLE, because event_reminders and event_reminder_sends are readable
 * and writable by nobody else (migration 20261021000020).
 */

type DueDbRow = Database['public']['Functions']['walk_in_reminders_due']['Returns'][number]
type OrgNames = { name: string; short_name: string | null }

type EventFacts = {
  title: string
  slug: string
  venueName: string | null
  venueCity: string | null
  directionsUrl: string | null
  organiserName: string
  days: GuideDay[]
}

function directions(e: {
  venue_latitude: number | null
  venue_longitude: number | null
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
}): string | null {
  const destination =
    typeof e.venue_latitude === 'number' && typeof e.venue_longitude === 'number'
      ? `${e.venue_latitude},${e.venue_longitude}`
      : formatVenueWithAddress({
          name: e.venue_name,
          address: e.venue_address,
          city: e.venue_city,
          state: e.venue_state,
          country: e.venue_country,
        })
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}` : null
}

export function reminderStore(): ReminderSendDeps {
  const admin = createAdminClient()
  const origin = getSiteUrl()
  const facts = new Map<string, Promise<EventFacts>>()

  const eventFacts = (eventId: string): Promise<EventFacts> => {
    const cached = facts.get(eventId)
    if (cached) return cached
    const read = (async () => {
      const { data, error } = await admin
        .from('events')
        .select(
          'title, slug, venue_name, venue_address, venue_city, venue_state, venue_country, venue_latitude, venue_longitude, organisation:organisations(name, short_name), guide:event_guides(days)',
        )
        .eq('id', eventId)
        .single()
      if (error || !data) throw new Error(`the event ${eventId} could not be read: ${error?.message ?? 'no row'}`)
      const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
      // An embed comes back as one row or a list of one, as reminderEventTitle reads it below.
      const org = one(data.organisation as OrgNames | OrgNames[] | null)
      const guide = one(data.guide as { days: unknown } | { days: unknown }[] | null)
      const parsed = parseGuide({ days: guide?.days ?? [] })
      return {
        title: data.title,
        slug: data.slug,
        venueName: data.venue_name,
        venueCity: data.venue_city,
        directionsUrl: directions(data),
        organiserName: org?.short_name || org?.name || 'The organiser',
        days: parsed.ok ? parsed.guide.days : [],
      }
    })()
    facts.set(eventId, read)
    return read
  }

  return {
    async due(kind, eventId, limit, now, localHour) {
      const { data, error } = await admin.rpc('walk_in_reminders_due', {
        p_kind: kind,
        p_event_id: eventId ?? undefined,
        p_limit: limit,
        p_now: now.toISOString(),
        p_local_hour: localHour,
      })
      if (error) throw new Error(`walk_in_reminders_due failed: ${error.message}`)
      return ((data ?? []) as DueDbRow[]).map(
        (r): DueRow => ({
          reminderId: r.reminder_id,
          email: r.email,
          token: r.unsubscribe_token,
          eventId: r.event_id,
          firstDay: r.first_day,
          timezone: r.timezone,
        }),
      )
    },

    async claim(reminderId, kind) {
      const { data, error } = await admin
        .from('event_reminder_sends')
        .upsert({ reminder_id: reminderId, kind }, { onConflict: 'reminder_id,kind', ignoreDuplicates: true })
        .select('id')
      if (error) throw new Error(`the claim failed: ${error.message}`)
      // ignoreDuplicates returns no row when the claim was already taken.
      return (data ?? []).length === 1
    },

    async send(row: DueRow, kind: ReminderKind) {
      const e = await eventFacts(row.eventId)
      const email = buildReminderEmail({
        kind,
        origin,
        token: row.token,
        event: { title: e.title, slug: e.slug, venueName: e.venueName, venueCity: e.venueCity, directionsUrl: e.directionsUrl },
        organiserName: e.organiserName,
        days: e.days,
      })
      return sendEmail({
        to: row.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
        messageType: kind === 'program' ? 'walk_in_program_update' : 'walk_in_day_before',
        recipientRole: 'prospect',
      })
    },

    async purge(days) {
      const { data, error } = await admin.rpc('purge_walk_in_reminders', { p_days: days })
      if (error) throw new Error(`purge_walk_in_reminders failed: ${error.message}`)
      return data ?? 0
    },

    async record(reminderId, kind, result) {
      const { error } = await admin
        .from('event_reminder_sends')
        .update(
          result.providerId
            ? { sent_at: new Date().toISOString(), provider_message_id: result.providerId }
            : { error: (result.error ?? 'unknown').slice(0, 1000) },
        )
        .eq('reminder_id', reminderId)
        .eq('kind', kind)
      if (error) console.error('[walk-in-reminders] the send could not be recorded', { reminderId, kind, error: error.message })
    },
  }
}

/** Stop one person's reminders for one event, by the token in their email. */
export async function stopReminderByToken(token: string): Promise<'stopped' | 'already' | 'unknown'> {
  // The one shape test (src/lib/consent/token.ts): a malformed token is 22P02,
  // not no row, and a stop link must never answer 500.
  if (!isUnsubscribeToken(token)) return 'unknown'
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('event_reminders')
    .select('id, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (error) throw new Error(`the reminder could not be read: ${error.message}`)
  if (!data) return 'unknown'
  if (data.unsubscribed_at) return 'already'
  const { error: updateError } = await admin
    .from('event_reminders')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', data.id)
  if (updateError) throw new Error(`the stop could not be saved: ${updateError.message}`)
  return 'stopped'
}

/** The event a stop token belongs to, for the stop page to name it. */
export async function reminderEventTitle(token: string): Promise<string | null> {
  if (!isUnsubscribeToken(token)) return null
  const { data } = await createAdminClient()
    .from('event_reminders')
    .select('event:events(title)')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  const ev = data?.event as { title: string } | { title: string }[] | null | undefined
  return (Array.isArray(ev) ? ev[0]?.title : ev?.title) ?? null
}
