'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertCallerMayActForOrganisation } from '@/lib/organisations/act-for'
import { afterResponse } from '@/lib/after-response'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { isWalkIn } from '@/lib/events/entry-mode'
import { parseGuide } from '@/lib/walk-in/guide'
import { eventlinqsListingProblems } from '@/lib/events/eventlinqs-listing-words'
import { runReminderPasses } from '@/lib/walk-in/reminder-sends'
import { reminderStore } from '@/lib/walk-in/reminder-store'
import { revalidateEventSurfacesById } from '@/lib/events/revalidate-event'

/**
 * THE ORGANISER'S WALK-IN ACTIONS (WI1): save the guide, and publish the full
 * program, which sends the one program update to everyone who asked for it.
 *
 * Both prove the caller may act for the organisation before anything is read
 * with the service role, exactly as the event actions do
 * (no-unowned-organisation-read), and both refuse anything that is not a
 * walk-in event.
 */

type Result = { ok: true; message?: string } | { ok: false; error: string }

async function ownedWalkInEvent(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to change this event.' } as const
  const { data: event } = await supabase
    .from('events')
    .select('id, slug, status, organisation_id, entry_mode, listing_source, end_date')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { error: 'Event not found' } as const
  const authority = await assertCallerMayActForOrganisation(user.id, event.organisation_id, 'owner_or_manager')
  if (!authority.ok) return { error: 'Event not found' } as const
  if (!isWalkIn(event)) return { error: 'This is not a free walk-in event.' } as const
  return { event, userId: user.id } as const
}

/** Save the whole guide, parsed against the one shape the page is drawn for. */
export async function saveWalkInGuide(eventId: string, input: unknown): Promise<Result> {
  const limited = await actionRateLimit('event-create')
  if (!limited.ok) return { ok: false, error: 'Too many saves. Try again in a moment.' }
  const owned = await ownedWalkInEvent(eventId)
  if ('error' in owned) return { ok: false, error: owned.error ?? 'Event not found' }

  const parsed = parseGuide(input)
  if (!parsed.ok) return { ok: false, error: `Some of the guide could not be saved: ${parsed.problems[0]}` }
  // On a listing EventLinqs wrote, our own lines carry no ticket or book word
  // and no dollar sign (Lawal, rulings 2 and 3 of 21 October 2026).
  if (owned.event.listing_source === 'eventlinqs') {
    const words = eventlinqsListingProblems({ guide: parsed.guide })
    if (words.length > 0) return { ok: false, error: words[0] }
  }
  // program_published_at is never written from the form: publishing the program
  // is its own action, below, because it sends mail.
  const { program_published_at: _ignored, ...guide } = parsed.guide
  void _ignored

  const { error } = await createAdminClient()
    .from('event_guides')
    .upsert({ event_id: eventId, ...guide }, { onConflict: 'event_id' })
  if (error) {
    console.error('[walk-in] the guide could not be saved', { eventId, error: error.message })
    return { ok: false, error: 'The guide did not save. Nothing was changed. Try again in a moment.' }
  }
  await revalidateEventSurfacesById(createAdminClient(), eventId)
  return { ok: true }
}

/**
 * Publish the full program. Once only: the database refuses a second press
 * (trg_guide_program_published_once). The update goes at once, and the hourly
 * run is the backstop if this send does not finish.
 */
export async function publishWalkInProgram(eventId: string): Promise<Result> {
  const owned = await ownedWalkInEvent(eventId)
  if ('error' in owned) return { ok: false, error: owned.error ?? 'Event not found' }
  if (owned.event.status !== 'published') {
    return { ok: false, error: 'Publish the event first. The program goes to people who asked on the live page.' }
  }
  // After the event there is no program to send, and a message sent then could
  // outlive its own stop link: a Remind me row is deleted 30 days after its
  // event ends, and ACMA wants a stop to work for 30 days after a message
  // (docs/walk-in/LAW7-READING-2026-10-21.md, Unsubscribe).
  if (new Date(owned.event.end_date).getTime() < Date.now()) {
    return { ok: false, error: 'This event has finished, so there is no program left to send.' }
  }

  const admin = createAdminClient()
  const { data: guide, error: readError } = await admin
    .from('event_guides')
    .select('days, program_published_at')
    .eq('event_id', eventId)
    .maybeSingle()
  if (readError) return { ok: false, error: 'The program could not be read just now. Nothing was sent.' }
  if (guide?.program_published_at) return { ok: false, error: 'The full program was already sent.' }
  const days = parseGuide({ days: guide?.days ?? [] })
  if (!days.ok || days.guide.days.every((d) => d.items.length === 0)) {
    return { ok: false, error: 'Add the program for at least one day before sending it.' }
  }

  const { error } = await admin
    .from('event_guides')
    .update({ program_published_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .is('program_published_at', null)
  if (error) return { ok: false, error: 'The program could not be published. Nothing was sent.' }

  afterResponse('send the walk-in program update', () => runReminderPasses(reminderStore(), new Date(), eventId))
  await revalidateEventSurfacesById(admin, eventId)
  return { ok: true, message: 'The full program is published and on its way to everyone who asked.' }
}
