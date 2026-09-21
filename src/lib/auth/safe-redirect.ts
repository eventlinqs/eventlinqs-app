/**
 * WHERE A PERSON GOES AFTER SIGNING IN. ONE ANSWER, ONE CHECK, TWO SPELLINGS.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT A LINE AT EACH CALL SITE.
 *
 * It was a line at each call site until 21 September 2026, and the two copies
 * had already drifted in the direction that matters. The magic-link route's
 * `safeNextPath` rejected a BACKSLASH; the login form's inline check did not,
 * and a backslash is the whole difference:
 *
 *     new URL('/\\evil.com', 'https://eventlinqs.com.au/login').href
 *       -> 'https://evil.com/'
 *
 * WHATWG URL parsing treats a backslash as a forward slash for special schemes,
 * so `/\evil.com` is protocol-relative in effect. The login form's check asked
 * "does it start with `//`" and this does not, so it was waved through and
 * handed to `router.push`. An open redirect is worst on the sign-in page: the
 * person has just typed their password and is watching for the app to take them
 * somewhere, which is exactly the moment a redirect is not questioned.
 *
 * ---------------------------------------------------------------------------
 * WHY IT READS TWO PARAMETER NAMES.
 *
 * Both spellings are genuine conventions in this tree, and neither is a typo:
 * `/auth/callback` and `/auth/confirm` have always read `next`, which is
 * Supabase's own name for it, while the page guards that bounce an
 * unauthenticated visitor were split between the two. On 21 September 2026 the
 * count was twelve emitting `redirect` and NINE emitting `next`, against a login
 * form that read only `redirect`. Those nine deep links all dropped the person
 * on the dashboard instead of where they were going, including `/scan/[eventId]`
 * (a door staffer at a venue, on their phone) and
 * `/squad/[token]/pay/[member_id]` (somebody paying their share of a booking).
 *
 * Reading both is the fix that holds. Rewriting nine call sites to say
 * `redirect` fixes today and leaves the next person to guess, and
 * `scripts/guards/one-name-for-where-you-were-going.mjs` fails the build if a
 * third spelling ever appears.
 */

/** Where a person goes when there is nowhere better, or nowhere safe. */
export const DEFAULT_DESTINATION = '/dashboard'

/**
 * The only place that decides whether a redirect target may be followed.
 *
 * Same-origin absolute paths survive and nothing else does. Each refusal below
 * is a shape that resolves OFF-ORIGIN when handed to a browser, rather than a
 * stylistic preference:
 *
 *   not starting with `/`   relative, so it resolves against the current path
 *   starting with `//`      protocol-relative: `//evil.com` is a whole origin
 *   containing `://`        an absolute URL of any scheme
 *   containing a backslash  normalised to `/`, so `/\evil.com` is `//evil.com`
 */
export function safeRedirectPath(candidate: string | null | undefined): string {
  if (!candidate) return DEFAULT_DESTINATION
  if (!candidate.startsWith('/')) return DEFAULT_DESTINATION
  if (candidate.startsWith('//')) return DEFAULT_DESTINATION
  if (candidate.includes('://')) return DEFAULT_DESTINATION
  if (candidate.includes('\\')) return DEFAULT_DESTINATION
  return candidate
}

/** The shape both `URLSearchParams` and Next's `ReadonlyURLSearchParams` share. */
type ReadableParams = { get: (name: string) => string | null }

/**
 * Where this person was going before they were asked to sign in.
 *
 * `redirect` wins when both are present, so a page that emits one convention can
 * never be surprised by the other arriving alongside it.
 *
 * A REFUSED VALUE IS A REFUSAL, NOT A REASON TO TRY THE OTHER SPELLING. If
 * `redirect` is present and unsafe, the answer is the default destination, never
 * whatever `next` happened to say: otherwise an attacker who can set both gets
 * to use the poisoned one to unlock the clean one's code path.
 */
export function readRedirectParam(params: ReadableParams): string {
  const raw = params.get('redirect') ?? params.get('next')
  return safeRedirectPath(raw)
}
