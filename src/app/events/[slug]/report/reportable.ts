import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

/**
 * A night anyone can see, so anyone can report it: public or unlisted (reached by its link), and in a status whose page
 * a visitor reads. A draft, a scheduled night not yet out, an archived night (its page answers 410) or a private one
 * has no public page to report.
 */
export const REPORTABLE_STATUSES = ['published', 'paused', 'postponed', 'cancelled', 'completed'] as const

export async function reportableEvent(db: SupabaseClient<Database>, slug: string): Promise<{ id: string; title: string; slug: string; listing_source: string } | null> {
  if (!slug) return null
  return readOrThrow('report page event', () =>
    db
      .from('events')
      .select('id, title, slug, listing_source')
      .eq('slug', slug)
      .in('status', [...REPORTABLE_STATUSES])
      .in('visibility', ['public', 'unlisted'])
      .limit(1)
      .maybeSingle(),
  )
}
