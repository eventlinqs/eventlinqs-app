import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import { checkPublishGate } from '@/lib/events/publish-gate'
import { attachGeneratedCover } from '@/lib/events/generated-cover'
import { isComposedCover } from '@/lib/images/event-media'
import { listingPhotoFor } from './listing-photo'
import { providerOf } from '@/lib/events/booking-links'
import type { SeriesBookingLink } from './listing-rows'
import { deleteEventEverywhere } from '@/lib/events/delete-event-core'
import { revalidateEventSurfacesFromRouteHandlerById } from '@/lib/events/revalidate-event'
import { canTransition } from '@/lib/event-lifecycle'
import { resolveVenueCoordinates } from '@/lib/geo/venue-coordinates'
import { deploymentEnvironment, judgeVenueSave } from '@/lib/geo/venue-save-rule'
import { resolveSuburbSlug } from '@/lib/cities/resolve-suburb'
import { venueSlugify } from '@/lib/venues/venue-slug'
import type { EventStatus } from '@/types/database'
import { occurrenceSlug, type ExistingOccurrence } from './occurrence-plan'
import type { CreateOccurrence, ListingNight, OccurrenceStore, StoreResult } from './occurrence-run'

/**
 * THE DAILY RUN'S DATABASE (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 7a).
 *
 * Everything here is a step the organiser's own path already takes, reused:
 * the venue coordinates rule and its production refusal, the suburb claim, the
 * designed typographic cover (ruling B, Law 6), the WI1 publish gate, the
 * lifecycle law for a date that comes off, and the route-handler form of
 * revalidation, because the run is a cron. Nothing is published around the gate.
 *
 * A NEW OCCURRENCE is written as a draft first, with its guide day, so its
 * cover can be composed from its own saved details; the gate then judges the
 * real row's facts, and only then is it published. A refusal at any step takes
 * the draft away again and names the reason, so a half-made occurrence never
 * stays behind.
 *
 * created_by is NOT NULL on events and names a person: an occurrence names the
 * owner of the organisation that holds it (Lawal's own account in production,
 * ruling A), never anyone else.
 */

const PAGE = 1000
const RUN_ACTOR = { id: null, email: null, role: 'listings-run' } as const

const refused = (reason: string): StoreResult => ({ ok: false, reason })
const clock5 = (t: string | null) => (t === null ? null : t.slice(0, 5))

type VenueRow = {
  id: string
  name: string
  slug: string | null
  address: string | null
  city: string | null
  city_slug: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  removed_at: string | null
}

/**
 * A READ THE RUN CAN REPEAT. A transient fault (the pool, a statement timeout, a dropped connection) is tried
 * again exactly as a page read is (withBuildRetry, src/lib/supabase/build-retry.ts), so one failed connection
 * no longer ends a run a second attempt would finish (drive 3 of WI2 Part 2, 25 October 2026: "event_series
 * could not be read: TypeError: fetch failed"). A read that still fails names its cause: supabase-js keeps
 * the real error in `details` ("Caused by: ..."), not in `message`, which alone says only "fetch failed".
 */
async function reread<R extends { error: unknown }>(what: string, run: () => PromiseLike<R>): Promise<R> {
  const res = (await withBuildRetry(run as unknown as () => PromiseLike<{ data: unknown; error: unknown }>, {
    label: `listing-occurrences ${what}`,
  })) as unknown as R
  if (res.error) throw new Error(`${what} could not be read: ${described(res.error)}`)
  return res
}

function described(error: unknown): string {
  const e = error as { message?: unknown; details?: unknown } | null
  const message = typeof e?.message === 'string' ? e.message : String(error)
  const cause = typeof e?.details === 'string' ? e.details.match(/Caused by: ([^\n]+)/)?.[1] : undefined
  return cause ? `${message} (${cause})` : message
}

export function occurrenceStore(): OccurrenceStore {
  const admin = createAdminClient()
  const venues = new Map<string, Promise<VenueRow | null>>()
  const owners = new Map<string, Promise<string | null>>()

  const venueFor = (id: string) => {
    let read = venues.get(id)
    if (!read) {
      read = (async () => {
        const { data } = await reread(`venue ${id}`, () =>
          admin
            .from('venues')
            .select('id, name, slug, address, city, city_slug, state, country, postal_code, latitude, longitude, removed_at')
            .eq('id', id)
            .maybeSingle(),
        )
        return (data as VenueRow | null) ?? null
      })()
      venues.set(id, read)
    }
    return read
  }

  const ownerOf = (organisationId: string) => {
    let read = owners.get(organisationId)
    if (!read) {
      read = (async () => {
        const { data } = await reread(`organisation ${organisationId}`, () =>
          admin.from('organisations').select('owner_id').eq('id', organisationId).maybeSingle(),
        )
        return (data?.owner_id as string | undefined) ?? null
      })()
      owners.set(organisationId, read)
    }
    return read
  }

  const takeAway = async (eventId: string, why: string): Promise<StoreResult> => {
    const gone = await deleteEventEverywhere({ eventId, actor: RUN_ACTOR, deleteWith: admin, revalidateFrom: 'route-handler' })
    return refused(gone.ok ? why : `${why}; the draft could not be taken away either: ${gone.message}`)
  }

  /*
   * A LISTING NIGHT CARRIES A PHOTOGRAPH (Lawal's ruling of 27 October 2026,
   * 08:33): EventLinqs' licensed library shot for its category, until its host's
   * own shows. Only where no library URL can be made (no store configured) is
   * the composed cover the fallback, so a night is never without a picture.
   */
  const attachListingPhoto = async (eventId: string, categoryId: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> => {
    const { data: category, error } = await admin.from('event_categories').select('slug').eq('id', categoryId).maybeSingle()
    if (error) return { ok: false, reason: `its category could not be read: ${error.message}` }
    const url = listingPhotoFor((category?.slug as string | undefined) ?? null)
    if (!url) {
      const cover = await attachGeneratedCover(eventId)
      return cover.ok ? { ok: true, url: cover.url } : { ok: false, reason: `${cover.reason}${cover.detail ? ` (${cover.detail})` : ''}` }
    }
    const { error: updateError } = await admin.from('events').update({ cover_image_url: url, thumbnail_url: url }).eq('id', eventId)
    if (updateError) return { ok: false, reason: `its photograph could not be set: ${updateError.message}` }
    return { ok: true, url }
  }

  return {
    async nights() {
      const out: ListingNight[] = []
      for (let from = 0; ; from += PAGE) {
        const { data } = await reread('event_series', () =>
          admin
            .from('event_series')
            .select('id, organisation_id, venue_id, name, rule, anchor_date, starts_at, ends_at, timezone, category_id, age_restriction_min, summary, skip_dates, status, booking_links')
            .order('id')
            .range(from, from + PAGE - 1),
        )
        for (const r of data ?? []) {
          out.push({
            id: r.id,
            organisationId: r.organisation_id,
            venueId: r.venue_id,
            status: r.status as ListingNight['status'],
            name: r.name,
            summary: r.summary,
            categoryId: r.category_id ?? '',
            ageRestrictionMin: r.age_restriction_min,
            rule: r.rule as ListingNight['rule'],
            anchorDate: r.anchor_date,
            startsAt: clock5(r.starts_at) as string,
            endsAt: clock5(r.ends_at),
            timezone: r.timezone,
            skipDates: r.skip_dates ?? [],
            bookingLinks: (r.booking_links ?? []) as SeriesBookingLink[],
          })
        }
        if ((data ?? []).length < PAGE) break
      }
      return out
    },

    async occurrences(seriesId) {
      const { data } = await reread(`the occurrences of ${seriesId}`, () =>
        admin
          .from('events')
          .select('id, occurrence_date, status, created_at, title, summary, start_date, end_date, timezone, category_id, age_restriction_min, guide:event_guides(days)')
          .eq('listing_series_id', seriesId),
      )
      const rows: ExistingOccurrence[] = []
      for (const e of data ?? []) {
        const { count } = await reread(`the reminders of ${e.id}`, () =>
          admin
            .from('event_reminders')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', e.id)
            .is('unsubscribed_at', null),
        )
        const guide = (Array.isArray(e.guide) ? e.guide[0] : e.guide) as { days?: Array<{ opens?: string | null; closes?: string | null }> } | null
        const day = guide?.days?.[0]
        rows.push({
          id: e.id,
          occurrenceDate: e.occurrence_date as string,
          status: e.status,
          title: e.title,
          summary: e.summary,
          startIso: e.start_date,
          endIso: e.end_date,
          timezone: e.timezone,
          categoryId: e.category_id,
          ageRestrictionMin: e.age_restriction_min,
          opens: day?.opens ?? null,
          closes: day?.closes ?? null,
          reminderCount: count ?? 0,
          createdAt: e.created_at,
        })
      }
      return rows
    },

    async create({ night, date, fields, guideDay }: CreateOccurrence) {
      if (!fields.category_id) return refused('the night has no category')
      const venue = await venueFor(night.venueId)
      if (!venue) return refused('its venue could not be found')
      if (venue.removed_at) return refused(`${venue.name} was removed`)
      const createdBy = await ownerOf(night.organisationId)
      if (!createdBy) return refused('the organisation that holds the night has no owner')

      // Coordinates once per venue, by the organiser's own rule, stored on the venue.
      let latitude = venue.latitude
      let longitude = venue.longitude
      let geocodeSource: 'geocoding' | 'manual' | null = latitude !== null && longitude !== null ? 'manual' : null
      if (latitude === null || longitude === null) {
        const found = await resolveVenueCoordinates({
          event_type: 'in_person',
          venue_name: venue.name,
          venue_address: venue.address,
          venue_city: venue.city,
          venue_state: venue.state,
          venue_country: venue.country,
          venue_postal_code: venue.postal_code,
          venue_latitude: null,
          venue_longitude: null,
        })
        const verdict = judgeVenueSave({
          eventType: 'in_person',
          venueAddress: venue.address,
          coordinates: found,
          environment: deploymentEnvironment(),
        })
        if (!verdict.ok) return refused(`no coordinates for ${venue.name}: ${found.reason ?? verdict.error}`)
        if (found.venue_latitude !== null && found.venue_longitude !== null) {
          latitude = found.venue_latitude
          longitude = found.venue_longitude
          geocodeSource = 'geocoding'
          const { error } = await admin.from('venues').update({ latitude, longitude }).eq('id', venue.id)
          if (error) return refused(`the coordinates for ${venue.name} could not be stored: ${error.message}`)
          venues.set(venue.id, Promise.resolve({ ...venue, latitude, longitude }))
        }
      }

      // WI3: a night sold elsewhere, or free with registration, is a tickets event whose
      // button is its links; a walk-in event may carry no outside link at all
      // (events_walk_in_is_in_person_and_sells_nothing). Nothing is sold here either way.
      const links = night.bookingLinks ?? []
      const soldElsewhere = links.length > 0
      const slug = occurrenceSlug(night.name, venue.slug ?? venueSlugify(venue.name), date)
      const { data: inserted, error: insertError } = await admin
        .from('events')
        .insert({
          ...fields,
          organisation_id: night.organisationId,
          created_by: createdBy,
          slug,
          description: null,
          event_type: 'in_person',
          visibility: 'public',
          status: 'draft',
          entry_mode: soldElsewhere ? 'tickets' : 'walk_in',
          ...(soldElsewhere ? { is_free: links.every((l) => l.kind === 'free_register') } : {}),
          listing_source: 'eventlinqs',
          listing_series_id: night.id,
          occurrence_date: date,
          venue_id: venue.id,
          venue_name: venue.name,
          venue_address: venue.address,
          venue_city: venue.city,
          venue_state: venue.state,
          venue_country: venue.country,
          venue_postal_code: venue.postal_code,
          venue_latitude: latitude,
          venue_longitude: longitude,
          venue_geocode_source: geocodeSource,
          venue_geocoded_at: latitude !== null ? new Date().toISOString() : null,
          // The row's city column decides (the 22:25 answer 4), never a guess.
          city_primary: venue.city_slug,
          suburb_primary: resolveSuburbSlug({ citySlug: venue.city_slug, latitude, longitude }),
        })
        .select('id')
        .single()
      if (insertError || !inserted) return refused(`the occurrence could not be written: ${insertError?.message ?? 'no row'}`)
      const eventId = inserted.id as string

      const { error: guideError } = await admin.from('event_guides').upsert({ event_id: eventId, days: [guideDay] }, { onConflict: 'event_id' })
      if (guideError) return takeAway(eventId, `its hours could not be written: ${guideError.message}`)

      const cover = await attachListingPhoto(eventId, fields.category_id)
      if (!cover.ok) return takeAway(eventId, `its photograph could not be set: ${cover.reason}`)

      if (soldElsewhere) {
        // Curated links, in the file's order; the database picks the one button and
        // writes events.external_ticket_url as its mirror (20261027130001).
        const { error: linksError } = await admin.from('event_booking_links').insert(
          links.map((l, position) => ({
            event_id: eventId,
            provider: providerOf(l.url),
            url: l.url,
            kind: l.kind,
            availability: 'on_sale',
            price_from_cents: l.price_from_cents,
            price_checked_at: l.price_checked_on === null ? null : `${l.price_checked_on}T00:00:00Z`,
            position,
            set_by: 'curated',
          })),
        )
        if (linksError) return takeAway(eventId, `where it sells could not be written: ${linksError.message}`)
      }

      const gate = await checkPublishGate(
        admin,
        {
          organisationId: night.organisationId,
          tiersHavePaid: false,
          coverImageUrl: cover.url,
          endsAt: fields.end_date,
          isPhysical: true,
          venueName: venue.name,
          venueAddress: venue.address,
          walkIn: soldElsewhere
            ? null
            : { tierCount: 0, days: [guideDay], startsAt: fields.start_date, endsAt: fields.end_date, timezone: fields.timezone },
        },
        null,
      )
      if (!gate.ok) return takeAway(eventId, `the publish gate refused it: ${gate.message}`)

      const { error: publishError } = await admin
        .from('events')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', eventId)
      if (publishError) return takeAway(eventId, `it could not be published: ${publishError.message}`)
      await revalidateEventSurfacesFromRouteHandlerById(admin, eventId)
      return { ok: true }
    },

    async update({ id, changes, guideDay }) {
      if (Object.keys(changes).length > 0) {
        const { error } = await admin
          .from('events')
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) return refused(`the occurrence could not be changed: ${error.message}`)
      }
      if (guideDay) {
        const { error } = await admin.from('event_guides').upsert({ event_id: id, days: [guideDay] }, { onConflict: 'event_id' })
        if (error) return refused(`its hours could not be changed: ${error.message}`)
      }
      // A night still wearing a composed cover (made before the 27 October ruling)
      // takes its library photograph the next time it changes. An organiser's own
      // artwork, or a photograph already set, is never replaced.
      if ('title' in changes || 'start_date' in changes) {
        const { data: current, error: readError } = await admin.from('events').select('cover_image_url, category_id').eq('id', id).maybeSingle()
        if (readError) return refused(`its cover could not be read: ${readError.message}`)
        if (current && isComposedCover(current.cover_image_url as string | null) && current.category_id) {
          const cover = await attachListingPhoto(id, current.category_id as string)
          if (!cover.ok) return refused(`its photograph could not be set: ${cover.reason}`)
        }
      }
      await revalidateEventSurfacesFromRouteHandlerById(admin, id)
      return { ok: true }
    },

    async cancel(id) {
      const { data, error } = await admin.from('events').select('status').eq('id', id).maybeSingle()
      if (error || !data) return refused(`the occurrence could not be read: ${error?.message ?? 'no row'}`)
      if (!canTransition(data.status as EventStatus, 'cancelled')) return refused(`an occurrence in ${data.status} cannot be cancelled`)
      const { error: updateError } = await admin.from('events').update({ status: 'cancelled' }).eq('id', id)
      if (updateError) return refused(`the occurrence could not be cancelled: ${updateError.message}`)
      await revalidateEventSurfacesFromRouteHandlerById(admin, id)
      return { ok: true }
    },

    async delete(id) {
      const gone = await deleteEventEverywhere({ eventId: id, actor: RUN_ACTOR, deleteWith: admin, revalidateFrom: 'route-handler' })
      return gone.ok ? { ok: true } : refused(gone.message)
    },
  }
}
