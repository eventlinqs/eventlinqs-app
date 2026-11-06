import type { SupabaseClient } from '@supabase/supabase-js'
import { COLLECT_AHEAD_DAYS, THIS_WEEK_DAYS, type KnownEvent, type RegisteredSource } from './collect'
import { addCuratedLinks } from './collect-accept'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import type { CollectionStore } from './collect-run'
import { huntDecision, huntFor, huntSummary } from './headline-hunt'
import { sellerName } from '@/lib/events/booking-links'
import { classify } from '@/lib/categories/classify'
import { toZonedInputValue } from '@/lib/dates/event-time'
import { venueSlugify } from '@/lib/venues/venue-slug'

/**
 * The collection run's reads and writes (item 19), through the service role: the register, the events already
 * listed (so a second source adds a link, never a card), the links an event carries, the candidates landed with their
 * judgement, the partner rule's links, and each source's outcome and run log (listing_source_runs).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** EventLinqs' own listings organisation (scripts/ops/import-city-listings.mjs): a source naming it is not a partner. */
export const LISTINGS_ORG_SLUG = 'eventlinqs-listings'

/** Why a row left the queue on its own: its night came before anyone reviewed it. */
export const PASSED_BEFORE_REVIEW = 'the night passed before review'

/** The source types a partner's own feed comes in by (D5's paths 1 and 3). */
const PARTNER_TYPES = new Set(['organiser_submission', 'venue_partnership'])

export function collectionStore(db: SupabaseClient): CollectionStore {
  return {
    async sources(): Promise<RegisteredSource[]> {
      const { data, error } = await db
        .from('listing_sources')
        .select(
          'id, name, page_url, city_slug, collection, changes, last_checked_at, last_success_at, permits_facts, permits_descriptions, permits_images, permits_links, verification, source_type, category_id, venue_id, organisation:organisations(slug), venue:venues(name, address, claimed_at, city_slug)',
        )
      if (error) throw new Error(`the register could not be read: ${error.message}`)
      /* LAW 19 section 7.4, each source's open canary (migration 20261106170001). Read on its own, so a database without
         the columns yet (before Lawal applies it) gives no canary and the run goes on exactly as before. */
      const canaries = new Map<string, { openedAt: string; release: string }>()
      const { data: open, error: canaryError } = await db.from('listing_sources').select('id, canary_opened_at, canary_release').not('canary_opened_at', 'is', null)
      if (!canaryError) for (const c of open ?? []) canaries.set(c.id as string, { openedAt: c.canary_opened_at as string, release: (c.canary_release as string | null) ?? '' })
      return (data ?? []).map((s) => {
        const org = (Array.isArray(s.organisation) ? s.organisation[0] : s.organisation) as { slug: string } | null
        const venue = (Array.isArray(s.venue) ? s.venue[0] : s.venue) as { name: string; address: string | null; claimed_at: string | null; city_slug: string | null } | null
        const owned = (org !== null && org.slug !== LISTINGS_ORG_SLUG) || (venue !== null && venue.claimed_at !== null)
        return {
          id: s.id as string,
          name: s.name as string,
          pageUrl: s.page_url as string,
          collection: s.collection as RegisteredSource['collection'],
          changes: s.changes as RegisteredSource['changes'],
          lastCheckedAt: (s.last_checked_at as string | null) ?? null,
          lastSuccessAt: (s.last_success_at as string | null) ?? null,
          permits: {
            facts: s.permits_facts === true,
            descriptions: s.permits_descriptions === true,
            images: s.permits_images === true,
            links: s.permits_links === true,
          },
          verified: s.verification === 'verified',
          /* A partner names its venue (in a city, whose zone dates the night) and its category too, or a night it gives
             could not be published. */
          partner: PARTNER_TYPES.has(s.source_type as string) && owned && venue !== null && venue.city_slug !== null && s.category_id !== null,
          partnerVenue: venue ? { name: venue.name, address: venue.address } : null,
          citySlug: (s.city_slug as string | null) ?? null,
          hunt: huntFor(s.page_url as string),
          canary: canaries.get(s.id as string) ?? null,
        }
      })
    },

    async known(now: Date): Promise<KnownEvent[]> {
      /* Read whole: a night past Supabase's silent thousand-row cap would never be matched, so its series would never
         be confirmed and would fall off the guides (the cliff). */
      const data = await readEveryRow<Record<string, unknown>>('the held nights', (from, to) =>
        db
          .from('events')
          .select('id, title, start_date, venue_id, venue_name, venue_address, city_primary, listing_series_id')
          .gte('start_date', new Date(now.getTime() - DAY_MS).toISOString())
          .lte('start_date', new Date(now.getTime() + COLLECT_AHEAD_DAYS * DAY_MS).toISOString())
          .not('venue_name', 'is', null)
          .order('id')
          .range(from, to),
      )
      return data.map((e) => ({
        eventId: e.id as string,
        venueId: (e.venue_id as string | null) ?? null,
        venueName: e.venue_name as string,
        venueAddress: (e.venue_address as string | null) ?? null,
        title: e.title as string,
        startsAt: e.start_date as string,
        citySlug: (e.city_primary as string | null) ?? null,
        seriesId: (e.listing_series_id as string | null) ?? null,
      }))
    },

    async confirmSeries(rows): Promise<void> {
      const { error } = await db.from('listing_checks').insert(
        rows.map((r) => ({
          series_id: r.seriesId,
          source_url: r.sourceUrl,
          source_date: r.sourceDate,
          import_file: `collection run, source ${r.sourceId}`,
          outcome: r.outcome,
          reuse_basis: r.reuseBasis,
        })),
      )
      if (error) throw new Error(`listing checks could not be written: ${error.message}`)
    },

    async venueAddresses(citySlug: string): Promise<ReadonlyMap<string, string>> {
      const { data, error } = await db
        .from('venues')
        .select('name, address')
        .eq('city_slug', citySlug)
        .is('removed_at', null)
        .not('address', 'is', null)
      if (error) throw new Error(`venues could not be read: ${error.message}`)
      const out = new Map<string, string>()
      for (const v of data ?? []) {
        const name = String(v.name ?? '').trim().toLowerCase()
        const address = String(v.address ?? '').trim()
        if (name && address) out.set(name, address)
      }
      return out
    },

    async heldLinks(eventId: string): Promise<Set<string>> {
      const { data, error } = await db.from('event_booking_links').select('url').eq('event_id', eventId)
      if (error) throw new Error(`booking links could not be read: ${error.message}`)
      return new Set((data ?? []).map((l) => l.url as string))
    },

    async addLinks(eventId, links, foundAt): Promise<void> {
      await addCuratedLinks(db, eventId, links, foundAt)
    },

    async land(row): Promise<boolean> {
      const write = (reasons: readonly string[]) => db
        .from('listing_candidates')
        .upsert(
          {
            source_id: row.sourceId,
            found_at: row.foundAt,
            kind: row.kind,
            event_id: row.eventId,
            title: row.title,
            starts_at: row.startsAt,
            ends_at: row.endsAt,
            venue_name: row.venueName,
            venue_address: row.venueAddress,
            page_url: row.pageUrl,
            image_url: row.imageUrl,
            description: row.description,
            links: row.links,
            change: row.change,
            confidence: row.confidence,
            reasons,
            decided_by: row.decidedBy,
            ...(row.decidedBy === 'partner_rule' ? { status: 'accepted', reviewed_at: row.foundAt } : {}),
          },
          { onConflict: 'source_id,page_url,starts_at', ignoreDuplicates: true },
        )
        .select('id')
      let { data, error } = await write(row.reasons)
      /* UNTIL THE FOUNDER APPLIES A NEW HOLD REASON'S MIGRATION (20261105160001 applied 5 November; 20261106090001,
         link_unreached, prepared 6 November): a database that does not yet allow one refuses the row
         (listing_candidates_reasons_known). The night still lands for a person, held, with the nearest reason it allows
         ('midnight_start', a fact not to be trusted), never published and never lost. */
      if (error && /listing_candidates_reasons_known/.test(error.message)) {
        const NEW = ['offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span', 'link_unreached', 'canary_hold']
        const allowed = [...new Set(row.reasons.map((r) => (NEW.includes(r) ? 'midnight_start' : r)))]
        ;({ data, error } = await write(allowed))
      }
      if (error) throw new Error(`a candidate could not be written: ${error.message}`)
      return (data ?? []).length > 0
    },

    async record(sourceId: string, outcome: string, at: Date, succeeded: boolean): Promise<void> {
      /* last_success_at moves only when the read succeeded (the checklist's D3). */
      const when = at.toISOString()
      const { error } = await db
        .from('listing_sources')
        .update({ last_checked_at: when, last_outcome: outcome, updated_at: when, ...(succeeded ? { last_success_at: when } : {}) })
        .eq('id', sourceId)
      if (error) throw new Error(error.message)
    },

    async publishPartnerNight(row): Promise<void> {
      const { data: c, error } = await db
        .from('listing_candidates')
        .select('id, decided_by, published_series_id')
        .eq('source_id', row.sourceId)
        .eq('page_url', row.pageUrl)
        .eq('starts_at', row.startsAt)
        .maybeSingle()
      if (error) throw new Error(`the accepted night could not be read: ${error.message}`)
      /* A row a person decides, or one already published, is not the rule's to publish. */
      if (!c || c.decided_by !== 'partner_rule' || c.published_series_id) return
      const { error: perr } = await db.rpc('listing_publish_partner_night', { p_candidate: c.id })
      if (perr) throw new Error(`the accepted night could not be published: ${perr.message}`)
    },

    async publishHuntNight(row, hunt, venueName): Promise<'published' | 'promoted' | void> {
      /* The candidate as the run landed it: one the hunt's rule accepted and not yet published (idempotent), or one that
         waited for a person from before the hunt read the page, decided by the rule now (huntDecision, car 44b). Every
         hunt night is published through its candidate row (car 46: one publication gate, no direct publish). */
      let promoted = false
      const { data, error } = await db
        .from('listing_candidates')
        .select('id, status, decided_by, published_series_id')
        .eq('source_id', row.sourceId)
        .eq('page_url', row.pageUrl)
        .eq('starts_at', row.startsAt)
        .maybeSingle()
      if (error) throw new Error(`the accepted night could not be read: ${error.message}`)
      const decision = huntDecision(
        data ? { status: data.status as string, decided_by: data.decided_by as string, published_series_id: (data.published_series_id as string | null) ?? null } : null,
        row,
      )
      if (!data || decision === 'leave') return
      if (decision === 'promote') {
        /* The CONTROLLER's 01:05 of 5 November 2026: 'For review ends for these sources'. Only a row still waiting is
           moved, so a person's decision taken meanwhile is never overwritten. */
        const { data: moved, error: moveError } = await db
          .from('listing_candidates')
          /* Today's own judgement, written as judged (huntDecision promotes only a row judged high with no reasons). */
          .update({ status: 'accepted', decided_by: 'partner_rule', confidence: row.confidence, reasons: row.reasons, reviewed_at: row.foundAt })
          .eq('id', data.id)
          .eq('status', 'waiting')
          .select('id')
        if (moveError) throw new Error(`the waiting night could not be decided by the hunt's rule: ${moveError.message}`)
        if (!moved || moved.length === 0) return
        promoted = true
      }
      const c = { id: data.id as string }
      if (row.title.trim().length > 80) throw new Error(`'${row.title.slice(0, 40)}...' is longer than a listing's 80 characters: a person names it`)
      const { data: org, error: orgError } = await db.from('organisations').select('id').eq('slug', LISTINGS_ORG_SLUG).maybeSingle()
      if (orgError || !org) throw new Error('the EventLinqs listings organisation could not be read')
      const { data: city, error: cityError } = await db.from('cities').select('name, timezone').eq('slug', hunt.citySlug).maybeSingle()
      if (cityError || !city?.timezone) throw new Error(`the timezone of ${hunt.citySlug} could not be read`)

      /* The venue EventLinqs holds by that name in that city, else made as a listing's venue is, from the night's own
         address. A venue that lists its own nights, or has claimed itself, is never listed for (the import's rule). */
      const { data: held, error: heldError } = await db
        .from('venues')
        .select('id, name, listing_source, claimed_at, removed_at')
        .eq('city_slug', hunt.citySlug)
        .ilike('name', venueName.replace(/[%_]/g, ''))
      if (heldError) throw new Error(`the venues could not be read: ${heldError.message}`)
      const same = (held ?? []).find((v) => !v.removed_at)
      if (same && (same.listing_source === 'organiser' || same.claimed_at)) throw new Error(`${venueName} lists its own nights on EventLinqs`)
      let venueId = (same?.id as string | undefined) ?? null
      if (!venueId && !(row.venueAddress ?? '').trim()) throw new Error(`${venueName} is not held and the page gives no address: a person adds it`)
      if (!venueId) {
        const { data: made, error: madeError } = await db
          .from('venues')
          .insert({
            organisation_id: org.id,
            name: venueName,
            address: row.venueAddress,
            city: city.name,
            state: 'VIC',
            country: 'Australia',
            slug: venueSlugify(venueName),
            city_slug: hunt.citySlug,
            listing_source: 'eventlinqs',
            is_active: true,
          })
          .select('id')
          .single()
        if (madeError || !made) throw new Error(`the venue could not be written: ${madeError?.message ?? 'no row'}`)
        venueId = made.id as string
      }

      const slug = classify({ title: row.title }).primary ?? hunt.usualCategory
      const { data: category, error: catError } = await db.from('event_categories').select('id').eq('slug', slug).maybeSingle()
      if (catError || !category) throw new Error(`category ${slug} is not in the database`)
      const local = toZonedInputValue(row.startsAt, city.timezone as string)
      const anchorDate = local.slice(0, 10)
      const today = toZonedInputValue(row.foundAt, city.timezone as string).slice(0, 10)
      const name = row.title.trim()
      const free = row.links.length > 0 && row.links.every((l) => l.priceFromCents === 0)
      const series = {
        venue_id: venueId,
        organisation_id: org.id,
        name,
        category_id: category.id,
        rule: 'once',
        anchor_date: anchorDate,
        day: new Date(`${anchorDate}T00:00:00Z`).getUTCDay(),
        starts_at: local.slice(11, 16),
        ends_at: null,
        timezone: city.timezone,
        /* Car 44c (the CONTROLLER's 14:55 (4)): a one line description from the night's own facts, which the row shows;
           and a night every link of which states it free is free entry, walk in, with no ticket link. */
        summary: huntSummary({ categorySlug: classify({ title: row.title }).primary ?? null, startsAt: row.startsAt, seller: free ? null : sellerName(row.links[0]?.url ?? null), free }),
        booking_links: free ? [] : row.links.map((l) => ({ url: l.url, kind: 'tickets', price_from_cents: l.priceFromCents, price_checked_on: l.priceFromCents === null ? null : today })),
        listing_source: 'eventlinqs',
        status: 'active',
      }
      let { data: made, error: seriesError } = await db.from('event_series').insert(series).select('id').single()
      if (seriesError?.code === '23505') {
        ;({ data: made, error: seriesError } = await db
          .from('event_series')
          .select('id')
          .eq('venue_id', venueId)
          .eq('name', name)
          .eq('rule', 'once')
          .eq('anchor_date', anchorDate)
          .eq('starts_at', series.starts_at)
          .single())
      }
      if (seriesError || !made) throw new Error(`the night could not be listed: ${seriesError?.message ?? 'no row'}`)
      const { error: checkError } = await db.from('listing_checks').insert({
        series_id: made.id,
        source_url: row.pageUrl,
        source_date: today,
        import_file: `big event hunt, source ${row.sourceId}`,
        outcome: 'confirmed',
        reuse_basis: 'licensed_source',
      })
      if (checkError) throw new Error(`the listing check could not be written: ${checkError.message}`)
      if (c) {
        const { error: markError } = await db.from('listing_candidates').update({ published_series_id: made.id }).eq('id', c.id)
        if (markError) throw new Error(`the candidate could not be marked published: ${markError.message}`)
      }
      return promoted ? 'promoted' : 'published'
    },

    async thisWeekSources(now: Date): Promise<Set<string>> {
      /* The sources whose own found nights start in the next seven days (any candidate it has found and not refused). */
      const rows = await readEveryRow<{ source_id: string }>('the sources with nights this week', (from, to) =>
        db
          .from('listing_candidates')
          .select('source_id')
          .neq('status', 'refused')
          .gte('starts_at', now.toISOString())
          .lte('starts_at', new Date(now.getTime() + THIS_WEEK_DAYS * DAY_MS).toISOString())
          .order('id')
          .range(from, to),
      )
      return new Set(rows.map((r) => r.source_id))
    },

    async expirePassed(now: Date, onlySources?: readonly string[]): Promise<number> {
      const at = now.toISOString()
      let q = db
        .from('listing_candidates')
        .update({ status: 'refused', refused_because: PASSED_BEFORE_REVIEW, reviewed_at: at })
        .eq('status', 'waiting')
        .lt('starts_at', at)
      if (onlySources) q = q.in('source_id', [...onlySources])
      const { data, error } = await q.select('id')
      if (error) throw new Error(error.message)
      return (data ?? []).length
    },

    async logRun(row): Promise<void> {
      const { error } = await db.from('listing_source_runs').insert({
        source_id: row.sourceId,
        ran_at: row.ranAt,
        succeeded: row.succeeded,
        http_status: row.httpStatus,
        outcome: row.outcome,
        found: row.found,
        landed: row.landed,
        queued: row.queued,
        accepted_by_rule: row.acceptedByRule,
      })
      if (error) throw new Error(`the run could not be logged: ${error.message}`)
    },
  }
}
