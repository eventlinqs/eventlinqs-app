import { createAdminClient } from '@/lib/supabase/admin'
import { EMPTY_GUIDE, parseGuide, type Guide } from './guide'
import { guideIsPublic } from './guide-visibility'

/**
 * The guide a walk-in page shows the public. The page has already resolved the
 * event under the event's own policies; this reads the guide with the service
 * client ONLY when guideIsPublic says the public may see it, and returns the
 * empty guide otherwise. See src/lib/walk-in/guide-visibility.ts for why.
 */
export async function readPublicGuide(event: { id: string; status?: string | null; visibility?: string | null; entry_mode?: string | null }): Promise<Guide> {
  if (!guideIsPublic(event)) return EMPTY_GUIDE
  const { data, error } = await createAdminClient()
    .from('event_guides')
    .select(
      'days, at_a_glance, highlights, highlights_note, program_note, quote_text, quote_attribution, getting_there, access_notes, photos_heading, cover_credit, photo_credit, program_published_at',
    )
    .eq('event_id', event.id)
    .maybeSingle()
  if (error) {
    console.error('[walk-in] the guide read failed', { eventId: event.id, error: error.message })
    return EMPTY_GUIDE
  }
  const parsed = parseGuide(data ?? {})
  if (!parsed.ok) {
    console.error('[walk-in] the guide did not parse', { eventId: event.id, problems: parsed.problems })
    return EMPTY_GUIDE
  }
  return parsed.guide
}
