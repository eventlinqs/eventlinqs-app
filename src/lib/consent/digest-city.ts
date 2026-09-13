import 'server-only'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'

/**
 * WHICH CITY A PLATFORM MARKETING CONSENT BELONGS TO. One rule, one place.
 *
 * The weekly digest is CITY SCOPED: `fetchDigestRecipients` selects consents
 * with `.eq('city_slug', citySlug)`. A consent row with a null city is
 * therefore in no send list at all, which means a person who was promised "a
 * weekly local digest" and said yes would never hear anything, and would not
 * find out. That is the same failure as a broken unsubscribe wearing the other
 * face, and it is the one the Spam Act enforcement record is full of.
 *
 * THIS LIVES HERE RATHER THAN IN THE CHECKOUT ACTION because there are THREE
 * purchase paths and only one of them had this. It was private to
 * `src/app/actions/checkout.ts`, so when close-out GA1 pointed the group-booking
 * checkout at the same consent table, it wrote a null city and reintroduced the
 * defect it had just fixed on the other path. Found by reading the digest's own
 * query rather than by anything failing.
 *
 * THE ORDER OF PREFERENCE. The buyer's chosen city wins, because it is what
 * they asked for; the event's city is the fallback, because it is where they
 * are demonstrably going; null is the honest answer when neither is known, and
 * it means "no local digest" rather than a guess. Both candidates are validated
 * against the cities taxonomy so the foreign key can never fail the write.
 *
 * It NEVER throws. A consent that could not be scoped must not fail a purchase.
 */
export async function resolveDigestCity(
  adminClient: SupabaseClient<Database>,
  eventId: string | null,
): Promise<string | null> {
  try {
    const jar = await cookies()
    const cookieCity = jar.get('el_city')?.value ?? null
    if (cookieCity) {
      const { data } = await adminClient
        .from('cities')
        .select('slug')
        .eq('slug', cookieCity)
        .maybeSingle()
      if (data?.slug) return data.slug
    }
    if (!eventId) return null
    const { data: event } = await adminClient
      .from('events')
      .select('city_primary')
      .eq('id', eventId)
      .maybeSingle()
    if (!event?.city_primary) return null
    // The event's own column is validated too: a stale or renamed slug would
    // fail the foreign key on the consent write, which would lose the consent.
    const { data: city } = await adminClient
      .from('cities')
      .select('slug')
      .eq('slug', event.city_primary)
      .maybeSingle()
    return city?.slug ?? null
  } catch (error) {
    captureException(error, { where: 'lib/consent/digest-city:resolveDigestCity' })
    return null
  }
}
