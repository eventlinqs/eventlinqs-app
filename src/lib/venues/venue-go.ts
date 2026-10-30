import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { visitorHash } from '@/lib/broadcast/share-links'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { pressDay } from '@/lib/growth/go-math'
import { followVenue, type GoVenue, type VenueVia } from './venue-go-math'

/** The rows behind /go/v/<venue> (the rules and why are in ./venue-go-math.ts). */

export async function readGoVenue(code: string): Promise<GoVenue | null> {
  const admin = createAdminClient()
  return followVenue(code, {
    async venue(id) {
      const row = await readOrThrow('the venue a /go code names', () =>
        admin.from('venues').select('id, name, removed_at').eq('id', id).maybeSingle(),
      )
      return row ? { id: row.id, name: row.name, removed: row.removed_at !== null } : null
    },
    async mergedInto(id) {
      const row = await readOrThrow('the merge of a venue a /go code names', () =>
        admin.from('venue_merges').select('kept_venue_id').eq('dropped_venue_id', id).limit(1).maybeSingle(),
      )
      return row?.kept_venue_id ?? null
    },
  })
}

/** One press per visitor per venue per Melbourne day, never a crawler; a lost count never strands the visitor. */
export async function recordVenueGoPress(input: { venueId: string; via: VenueVia; ip: string | null; userAgent: string | null; isTest?: boolean }): Promise<boolean> {
  // A QA press (qa-marker.ts) is recorded as a test even from a crawler agent; every other crawler is not recorded.
  if (input.isTest !== true && isPreviewCrawler(input.userAgent)) return false
  try {
    const now = new Date()
    const { error } = await createAdminClient()
      .from('venue_go_presses')
      .upsert(
        {
          venue_id: input.venueId,
          via: input.via,
          visitor: visitorHash(input.ip, input.userAgent),
          day: pressDay(now, PLATFORM_TIME_ZONE),
          pressed_at: now.toISOString(),
          is_test: input.isTest === true,
        },
        { onConflict: 'venue_id,visitor,day', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    console.warn('[go/v] the press was not counted', err instanceof Error ? err.message : String(err))
    return false
  }
}
