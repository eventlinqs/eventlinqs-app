import type { SupabaseClient } from '@supabase/supabase-js'
import { COLLECT_AHEAD_DAYS, type KnownEvent, type RegisteredSource } from './collect'
import type { CollectionStore } from './collect-run'

/**
 * The collection run's reads and writes (item 19), through the service role: the register, the events already
 * listed (so a second source adds a link, never a card), the links an event carries, the candidates landed, and each
 * source's outcome.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function collectionStore(db: SupabaseClient): CollectionStore {
  return {
    async sources(): Promise<RegisteredSource[]> {
      const { data, error } = await db
        .from('listing_sources')
        .select('id, name, page_url, collection, changes, last_checked_at, last_success_at, permits_facts, permits_descriptions, permits_images, permits_links')
      if (error) throw new Error(`the register could not be read: ${error.message}`)
      return (data ?? []).map((s) => ({
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
      }))
    },

    async known(now: Date): Promise<KnownEvent[]> {
      const { data, error } = await db
        .from('events')
        .select('id, title, start_date, venue_id, venue_name, venue_address')
        .gte('start_date', new Date(now.getTime() - DAY_MS).toISOString())
        .lte('start_date', new Date(now.getTime() + COLLECT_AHEAD_DAYS * DAY_MS).toISOString())
        .not('venue_name', 'is', null)
      if (error) throw new Error(`events could not be read: ${error.message}`)
      return (data ?? []).map((e) => ({
        eventId: e.id as string,
        venueId: (e.venue_id as string | null) ?? null,
        venueName: e.venue_name as string,
        venueAddress: (e.venue_address as string | null) ?? null,
        title: e.title as string,
        startsAt: e.start_date as string,
      }))
    },

    async heldLinks(eventId: string): Promise<Set<string>> {
      const { data, error } = await db.from('event_booking_links').select('url').eq('event_id', eventId)
      if (error) throw new Error(`booking links could not be read: ${error.message}`)
      return new Set((data ?? []).map((l) => l.url as string))
    },

    async land(row): Promise<boolean> {
      const { data, error } = await db
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
          },
          { onConflict: 'source_id,page_url,starts_at', ignoreDuplicates: true },
        )
        .select('id')
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
  }
}
