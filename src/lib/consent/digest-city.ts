import 'server-only'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import { isCitySlug } from '@/lib/cities/data'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

/**
 * WHICH CITY A PLATFORM MARKETING CONSENT BELONGS TO. One rule, one place.
 *
 * The weekly digest is CITY SCOPED: `fetchDigestCities` selects consents with
 * `.not('city_slug', 'is', null)` and `fetchDigestRecipients` selects them with
 * `.eq('city_slug', citySlug)`. A consent row with a null city is therefore in
 * no send list at all, which means a person who was promised "a weekly local
 * digest" and said yes would never hear anything, and would not find out. That
 * is the same failure as a broken unsubscribe wearing the other face, and it is
 * the one the Spam Act enforcement record is full of.
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
 * it means "no local digest" rather than a guess.
 *
 * It NEVER throws. A consent that could not be scoped must not fail a purchase.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED ON 21 SEPTEMBER 2026, AND WHY THE OLD ARGUMENT FOR LEAVING IT
 * ALONE WAS WRONG.
 *
 * All three reads here discarded their error. This file was a NAMED, DATED
 * EXCEPTION in `scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs`
 * since 19 September 2026, and the exception's stated reason was that "its
 * fallback, null, means no local digest, which is an honest answer rather than a
 * false one, and a throw here would lose a consent over a blink".
 *
 * The first half of that is FALSE and the platform disproved it two days later.
 * Commit 4bfb0fd0 fixed the identical read, on the same column, in
 * `src/app/actions/consent.ts`, and wrote the true sentence beside it: "somebody
 * who chose Geelong filed as having chosen nowhere". A null written because a
 * read gave up is not an honest answer. It is precisely the false one, and it is
 * unrecoverable: the ledger is append only and by this platform's own rule a
 * consent row is never rewritten, so the city cannot be corrected afterwards.
 *
 * The second half is a TRUE statement about a throw and a false dilemma. A
 * throw is not the only alternative to believing a blink.
 *
 * MEASURED ON TEST, 21 September 2026, with each read failing on cue:
 *
 *     the buyer chose geelong, a city that is in public.cities
 *       cities read blinked, ONE request, no retry   ->  null
 *     an event that really is in melbourne
 *       events read blinked, ONE request, no retry   ->  null
 *
 * "One request, no retry" is the whole of the first fix: `readOrThrow` retries a
 * transient fault through `withBuildRetry`, so a dropped keep-alive socket is
 * asked again instead of believed. These reads asked once and gave up.
 *
 * THE THIRD READ IS GONE, because it had no honest null at all. It re-read
 * `public.cities` to validate the slug the events row had just handed back, and
 * `public.events.city_primary` carries `references public.cities(slug) on delete
 * set null` (supabase/migrations/20260507000001_city_taxonomy.sql:70). The
 * database will not hold a city_primary that is absent from cities, and will not
 * let a city be renamed out from under one. So that read could only ever return
 * the row it was handed or fail, and EVERY null it produced was a failure
 * wearing the costume of a validation. `scripts/guards/an-outage-is-not-a-
 * withdrawal.mjs` asserts the foreign key is still declared, because deleting a
 * check is only safe for as long as the thing that made it redundant is true.
 *
 * THE COOKIE FALLS BACK TO THE TAXONOMY IN CODE, which cannot blink. The cookie
 * is arbitrary text from a browser, so it does have to be validated, but the
 * same guard proves the 20 cities in `src/lib/cities/data.ts` are a SUBSET of
 * the ones `public.cities` is seeded with, so a slug the taxonomy accepts is a
 * slug the consent row's foreign key will accept. That is the difference between
 * a fallback and a guess.
 */

/**
 * A CITY, OR THE REASON THERE ISN'T ONE, and the two are not the same null.
 *
 * `city: null, unresolved: false`  neither the buyer nor the event names a city.
 *                                  Honest. It means "no local digest".
 * `city: null, unresolved: true`   a read gave up after retrying. Not an answer.
 *                                  The caller records the consent anyway, because
 *                                  losing it is worse, and says so rather than
 *                                  reporting a clean grant.
 */
export interface DigestCityResolution {
  city: string | null
  unresolved: boolean
}

const NO_CITY: DigestCityResolution = { city: null, unresolved: false }

/**
 * The rule itself, with the request already read off. Separated from the cookie
 * jar so it can be driven and tested: `cookies()` is request bound and throws
 * outside a request, and while it sat in the middle of this function the whole
 * of it could not be imported by a test at all, which is the reason it had no
 * behavioural test and the reason the defect above survived a guard written for
 * exactly that defect.
 */
export async function resolveDigestCityFor(
  adminClient: SupabaseClient<Database>,
  params: { eventId: string | null; cookieCity: string | null },
): Promise<DigestCityResolution> {
  const cookieCity = params.cookieCity
  if (cookieCity) {
    try {
      const city = await readOrThrow('the digest consent city, chosen', () =>
        adminClient.from('cities').select('slug').eq('slug', cookieCity).maybeSingle(),
      )
      if (city?.slug) return { city: city.slug, unresolved: false }
    } catch (error) {
      /*
       * THE TAXONOMY ANSWERS WHEN THE TABLE CANNOT. Not a guess: the guard
       * proves these 20 slugs are a subset of the ones the cities migration
       * seeds, so the consent row's foreign key accepts what this accepts.
       */
      captureException(error, { where: 'lib/consent/digest-city:cookieCity' })
      if (isCitySlug(cookieCity)) return { city: cookieCity, unresolved: false }
    }
    // A cookie that is not a city is not an error. Fall through to the event.
  }

  if (!params.eventId) return NO_CITY

  try {
    const event = await readOrThrow('the digest consent city, from the event', () =>
      adminClient.from('events').select('city_primary').eq('id', params.eventId as string).maybeSingle(),
    )
    // Used as it stands. The foreign key is what used to be re-checked here.
    return event?.city_primary ? { city: event.city_primary, unresolved: false } : NO_CITY
  } catch (error) {
    captureException(error, { where: 'lib/consent/digest-city:eventCity' })
    return { city: null, unresolved: true }
  }
}

/**
 * The same rule, for a caller that is inside a request and has a cookie jar.
 *
 * It NEVER throws, including when there is no request to read a jar from: a
 * consent that could not be scoped must not fail a purchase, and that contract
 * is older than this file's defect and survives it.
 */
export async function resolveDigestCity(
  adminClient: SupabaseClient<Database>,
  eventId: string | null,
): Promise<DigestCityResolution> {
  let cookieCity: string | null = null
  try {
    const jar = await cookies()
    cookieCity = jar.get('el_city')?.value ?? null
  } catch (error) {
    captureException(error, { where: 'lib/consent/digest-city:cookies' })
  }
  try {
    return await resolveDigestCityFor(adminClient, { eventId, cookieCity })
  } catch (error) {
    captureException(error, { where: 'lib/consent/digest-city:resolveDigestCity' })
    return { city: null, unresolved: true }
  }
}
