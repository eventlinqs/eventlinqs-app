'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { distributionDeps } from '@/lib/venues/venue-distribution'
import { giveVenueCalendar, stopVenueCalendar, type VenueCalendarAnswer, type VenueCalendarDeps } from '@/lib/venues/venue-calendar'

/**
 * A claimed venue gives EventLinqs its own calendar, or stops it, on /dashboard/organisation/media
 * (src/lib/venues/venue-calendar.ts, D3 (3)). Signed in always; the database says who may act for the venue, so
 * nothing here trusts an id from the form. Giving is limited per user by the 'organiser-media' policy (it adds a source
 * the collector reads every day); stopping never is.
 */

export type VenueCalendarState = VenueCalendarAnswer | null

const Id = z.string().uuid()
const melbourneToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' })

function deps(): VenueCalendarDeps {
  const admin = createAdminClient()
  return {
    rpc: distributionDeps(admin).rpc,
    async venue(venueId) {
      const { data, error } = await admin.from('venues').select('name, city_slug, organisation_id, organisation:organisations(name)').eq('id', venueId).maybeSingle()
      if (error) throw new Error(`the venue could not be read: ${error.message}`)
      if (!data || !data.organisation_id) return null
      const org = (Array.isArray(data.organisation) ? data.organisation[0] : data.organisation) as { name: string } | null
      return { name: data.name as string, citySlug: (data.city_slug as string | null) ?? null, organisationId: data.organisation_id as string, organisationName: org?.name ?? (data.name as string) }
    },
    async liveCalendars(venueId) {
      const { data, error } = await admin.from('listing_sources').select('id').eq('venue_id', venueId).eq('source_type', 'venue_partnership').eq('collection', 'read')
      if (error) throw new Error(`the venue's calendars could not be read: ${error.message}`)
      return (data ?? []).map((r) => r.id as string)
    },
    async insert(row) {
      const { data, error } = await admin.from('listing_sources').insert(row).select('id').single()
      if (error || !data) throw new Error(`the calendar was not saved: ${error?.message ?? 'no row'}`)
      return data.id as string
    },
    async source(sourceId) {
      const { data, error } = await admin.from('listing_sources').select('venue_id, source_type, collection').eq('id', sourceId).maybeSingle()
      if (error) throw new Error(`the calendar could not be read: ${error.message}`)
      return data ? { venueId: (data.venue_id as string | null) ?? null, sourceType: data.source_type as string, collection: data.collection as string } : null
    },
    async stop(sourceId) {
      const { error } = await admin.from('listing_sources').update({ collection: 'never' }).eq('id', sourceId)
      if (error) throw new Error(`the calendar was not stopped: ${error.message}`)
    },
  }
}

async function signedIn(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function giveVenueCalendarAction(_: VenueCalendarState, formData: FormData): Promise<VenueCalendarState> {
  const venueId = Id.safeParse(formData.get('venueId'))
  if (!venueId.success) return { state: 'refused', reason: 'Choose your venue.' }
  const categoryId = Id.safeParse(formData.get('categoryId'))
  if (!categoryId.success) return { state: 'refused', reason: 'Choose the kind of nights your calendar holds.' }
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to give us your calendar.' }
  const limited = await actionRateLimit('organiser-media', `user:${userId}`)
  if (!limited.ok) return { state: 'refused', reason: 'You have made several changes in the last hour. Try again later.' }
  const answer = await giveVenueCalendar(
    {
      userId,
      venueId: venueId.data,
      categoryId: categoryId.data,
      feedUrl: String(formData.get('feedUrl') ?? ''),
      ticked: formData.get('yes') === 'on',
      authority: formData.get('authority') === 'on',
      today: melbourneToday.format(new Date()),
    },
    deps(),
  )
  if (answer.state === 'done') revalidatePath('/dashboard/organisation/media')
  return answer
}

export async function stopVenueCalendarAction(_: VenueCalendarState, formData: FormData): Promise<VenueCalendarState> {
  const sourceId = Id.safeParse(formData.get('sourceId'))
  if (!sourceId.success) return { state: 'refused', reason: 'That is not a calendar your venue gave us.' }
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to stop your calendar.' }
  const answer = await stopVenueCalendar(userId, sourceId.data, deps())
  if (answer.state === 'done') revalidatePath('/dashboard/organisation/media')
  return answer
}
