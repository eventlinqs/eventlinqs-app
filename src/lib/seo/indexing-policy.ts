/**
 * THE INDEXING POLICY. One source of truth for what search engines may index.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * Google Search Console reported five exclusion reasons against this platform on
 * 6 September 2026: "alternate page with proper canonical tag"; "duplicate,
 * Google chose different canonical than user"; "excluded by noindex"; "not found
 * 404"; "page with redirect". The audit that followed (close-out C19, driven on
 * production on 8 September 2026, C:\dev\EVIDENCE\C19) found two causes, and
 * both are answered by this file existing.
 *
 * CAUSE ONE, THE LEAKED CANONICAL. `src/app/layout.tsx` used to declare
 * `alternates: { canonical: '/' }`. Next merges metadata FIELD BY FIELD, so any
 * page that did not declare its own `alternates` inherited the root's and told
 * Google, in writing, that the canonical version of itself was the HOMEPAGE.
 * Fifty-seven routes did this. Seven of them were indexable AND published in the
 * sitemap: every /help/[slug] topic. Search Console's first two exclusion
 * reasons are the literal name of that defect.
 *
 * CAUSE TWO, THE EMPTY TEMPLATE. Production publishes two events and a sitemap
 * of 550 URLs. 441 of those are community and community-by-city pages, 44 are
 * city and suburb pages and 22 are browse-city pages, and with no events they
 * differ from one another by a noun. Google collapses substantially identical
 * pages, and a canonical is a hint it is free to overrule. So a templated
 * discovery page is NOINDEX until it holds real content and becomes indexable
 * automatically when it does, and the sitemap publishes a URL only while that
 * URL is indexable. A page enters and leaves the sitemap with its own state.
 *
 * ============================================================================
 * THE FOUR CLASSES
 * ============================================================================
 *
 *   ALWAYS       a real page with its own content. Indexable, self-canonical,
 *                published in the sitemap.
 *   CONDITIONAL  a templated discovery page. Indexable and published in the
 *                sitemap only while it holds at least
 *                DISCOVERY_INDEXING_THRESHOLD publicly visible events;
 *                self-canonical either way, because the URL is its own page.
 *   ALIAS        a second address for a page that lives elsewhere. Always
 *                noindex, and canonical to the real page. This is the ONE class
 *                allowed to point its canonical somewhere else.
 *   NEVER        must not be indexed: authenticated, transactional,
 *                developer-only, or otherwise deliberately kept out of search.
 *                noindex, no canonical, never in the sitemap.
 *
 * Every page route under src/app carries exactly one class.
 * `scripts/guards/indexing-policy.mjs` fails the build when a route is
 * unclassified, when a classified route no longer exists, when a NEVER route
 * stops applying noIndexMetadata(), when an ALWAYS or CONDITIONAL page stops
 * declaring its own canonical, or when the sitemap publishes a NEVER route.
 *
 * NOTHING HERE HIDES A PAGE FROM A VISITOR. Every URL keeps rendering exactly as
 * it does today. This file governs one thing: what we ask a crawler to index.
 */

/** The classes a route can carry. See the header for what each one means. */
export type IndexingClass = 'always' | 'conditional' | 'alias' | 'never'

/**
 * HOW MANY PUBLICLY VISIBLE EVENTS A TEMPLATED DISCOVERY PAGE NEEDS BEFORE IT IS
 * OFFERED TO SEARCH ENGINES.
 *
 * ONE, by the owner's instruction in close-out SEO3 step 2: "Seed the minimum at
 * one." This constant was THREE until 14 September 2026 and the argument it
 * carried is kept here rather than deleted, because the owner may want it back
 * and an argument nobody can read is an argument nobody can reverse:
 *
 *   - One event makes the page real for a VISITOR (the platform's own
 *     one-event-shows-the-rail law, CLAUDE.md), but it does not make the page
 *     DIFFERENT from the other 440 in its family, and difference is what Google
 *     is judging when it collapses duplicates. That reasoning came from Search
 *     Console's own report of "duplicate, Google chose different canonical",
 *     which is the report close-out C19 was raised to answer.
 *   - Three was the smallest number at which the page's list, its map and its
 *     "what is on" heading all carry content unique to that community or city.
 *
 * The owner's number wins, and the consequence is written down rather than
 * discovered: at one, roughly 440 community-by-city pages become eligible the
 * moment a single event tags them. SEO3's reversal condition covers exactly that
 * ("the threshold rises rather than the pages being deleted"), and the resolver
 * below is what makes the reversal same-day instead of next-deploy.
 *
 * THIS CONSTANT IS NOW A FALLBACK, NOT THE ANSWER. It is what the platform uses
 * when the owner has set nothing, or when the settings row cannot be read. The
 * live number comes from `resolveDiscoveryThreshold()` in
 * src/lib/seo/discovery-threshold.ts. It is still the ONLY place this number is
 * written in the tree; nothing else may spell it.
 */
export const DISCOVERY_INDEXING_THRESHOLD = 1

/**
 * ROUTES NOTHING ON THE PLATFORM LINKS TO, ON PURPOSE.
 *
 * A crawl of production on 8 September 2026 (scripts/verify/internal-reachability.mjs,
 * close-out C19.1's fourth question) found ten route families no internal link
 * reached. Most had an explanation the crawler could work out for itself: the
 * page 404s because its feature flag is off, or there is no member to link to
 * because the catalogue holds none. These did not, and they are deliberate, so
 * they are written down rather than left to fail the check forever.
 *
 * Orphans found by the same crawl that were NOT deliberate were fixed rather
 * than listed here: the five /faith/[faith] pages now have a door on
 * /communities (a page whose own subheading already promised one), and the 21
 * /events/browse/[city] pages are linked from their city page.
 *
 * `/categories/[slug]` LEFT THIS LIST on 14 September 2026. It was here because
 * "category browsing on the platform routes to /events?category=", and close-out
 * SEO3 step 4 reversed exactly that: the homepage rails and the category tiles
 * now link to `/categories/<slug>`, so the family is navigated to and an entry
 * claiming otherwise would be a false record.
 */
export const UNLINKED_BY_DESIGN: Record<string, string> = {
  '/launch': 'a campaign landing reached from a link the founder sends, not from site navigation',
  '/waitlist': 'a campaign landing reached from a link the founder sends, not from site navigation',
}

export interface PolicyEntry {
  /** The route as it appears under src/app, dynamic segments as written. */
  route: string
  klass: IndexingClass
  /** Why. Read by nothing; read by the next person. */
  why: string
}

/**
 * EVERY PAGE ROUTE UNDER src/app, CLASSIFIED. Enumerated from disk on
 * 8 September 2026 (130 page routes: 76 static, 54 dynamic) and held to the tree
 * by the guard, which fails in both directions.
 */
export const INDEXING_POLICY: readonly PolicyEntry[] = [
  // ---------------------------------------------------------------- ALWAYS
  { route: '/', klass: 'always', why: 'the homepage' },
  { route: '/about', klass: 'always', why: 'marketing' },
  { route: '/careers', klass: 'always', why: 'marketing' },
  { route: '/cities', klass: 'always', why: 'the city index, its own content' },
  { route: '/communities', klass: 'always', why: 'the community index, its own content' },
  { route: '/contact', klass: 'always', why: 'marketing' },
  { route: '/events', klass: 'always', why: 'the catalogue index; meaningful with or without events' },
  { route: '/guides', klass: 'always', why: 'the organiser guide hub' },
  { route: '/guides/[slug]', klass: 'always', why: 'hand-written evergreen documentation' },
  { route: '/help', klass: 'always', why: 'the help centre hub' },
  { route: '/help/[slug]', klass: 'always', why: 'hand-written help topics; the seven pages whose canonical was leaking' },
  { route: '/launch', klass: 'always', why: 'a public campaign landing with its own copy' },
  { route: '/legal/accessibility', klass: 'always', why: 'legal' },
  { route: '/legal/cookies', klass: 'always', why: 'legal' },
  { route: '/legal/organiser-terms', klass: 'always', why: 'legal' },
  { route: '/legal/privacy', klass: 'always', why: 'legal' },
  { route: '/legal/refunds', klass: 'always', why: 'legal' },
  { route: '/legal/terms', klass: 'always', why: 'legal' },
  { route: '/forecast', klass: 'always', why: 'the free public forecast tool: no account, its own copy, and the one piece of marketing that is also product' },
  { route: '/organisers', klass: 'always', why: 'the organiser landing, the switching pitch' },
  { route: '/press', klass: 'always', why: 'marketing' },
  { route: '/pricing', klass: 'always', why: 'marketing; the fee transparency surface' },
  { route: '/waitlist', klass: 'always', why: 'a public landing with its own copy' },
  { route: '/events/[slug]', klass: 'always', why: 'a real event, its own content, Event structured data' },
  { route: '/venues/[handle]', klass: 'always', why: 'a real venue; the sitemap derives handles from events that exist, so a published venue page always holds one' },
  { route: '/artists', klass: 'always', why: 'the artist index; flag gated, and the sitemap asks the same flag the route asks' },
  { route: '/artists/[slug]', klass: 'always', why: 'a real artist with its own biography; flag gated' },
  { route: '/gigs', klass: 'always', why: 'the public gig board; flag gated on production' },

  // ----------------------------------------------------------- CONDITIONAL
  { route: '/community/[community]', klass: 'conditional', why: '21 templated community landings' },
  { route: '/community/[community]/[city]', klass: 'conditional', why: '420 templated community-by-city intersections, the largest duplicate family on the platform' },
  { route: '/city/[slug]', klass: 'conditional', why: 'templated city landings' },
  { route: '/city/[slug]/[suburb]', klass: 'conditional', why: 'templated suburb landings' },
  { route: '/categories/[slug]', klass: 'conditional', why: 'templated category landings' },
  { route: '/events/browse/[city]', klass: 'conditional', why: '22 templated browse-by-city pages' },
  { route: '/faith/[faith]', klass: 'conditional', why: 'templated faith landings' },
  { route: '/organisers/[handle]', klass: 'conditional', why: "an organiser profile, indexable while it holds events at the live threshold OR carries a biography; close-out SEO3 step 7 found /organisers/oanh published with neither" },
  { route: '/this-weekend', klass: 'conditional', why: 'the weekend discovery surface (close-out AQ3). Conditional rather than always, because its entire contents expire every Sunday night: it is the one page on the platform guaranteed to be empty on a regular schedule, and AQ3 rules that a surface that cannot be filled is not published' },

  // ----------------------------------------------------------------- ALIAS
  { route: '/for-organisers', klass: 'alias', why: '308 to /organisers; kept because external links reach for it' },
  { route: '/e/[code]', klass: 'alias', why: 'the printable short link for an event; canonical is /events/[slug]' },
  { route: '/events/[slug]/with/[artist]', klass: 'alias', why: 'an artist-attributed view of one event; canonical is /events/[slug]' },

  // ----------------------------------------------------------------- NEVER
  { route: '/account', klass: 'never', why: 'authenticated' },
  { route: '/account/notifications', klass: 'never', why: 'authenticated' },
  { route: '/account/saved', klass: 'never', why: 'authenticated' },
  { route: '/account/tickets', klass: 'never', why: 'authenticated' },
  { route: '/offline', klass: 'never', why: 'the service worker fallback document (close-out C8B.5): a real page only so it can wear the design system, never a search result' },
  { route: '/admin', klass: 'never', why: 'staff only' },
  { route: '/admin/analytics', klass: 'never', why: 'staff only' },
  { route: '/admin/audience', klass: 'never', why: 'staff only' },
  { route: '/admin/attribution', klass: 'never', why: 'staff only' },
  { route: '/admin/audit', klass: 'never', why: 'staff only' },
  { route: '/admin/campaigns', klass: 'never', why: 'staff only' },
  { route: '/admin/campaigns/[id]/proof', klass: 'never', why: 'staff only' },
  { route: '/admin/matches', klass: 'never', why: 'staff only' },
  { route: '/admin/disputes', klass: 'never', why: 'staff only' },
  { route: '/admin/disputes/[id]', klass: 'never', why: 'staff only' },
  { route: '/admin/enrol-2fa', klass: 'never', why: 'staff only' },
  { route: '/admin/events', klass: 'never', why: 'staff only' },
  { route: '/admin/events/[id]', klass: 'never', why: 'staff only' },
  { route: '/admin/flags', klass: 'never', why: 'staff only' },
  { route: '/admin/health', klass: 'never', why: 'staff only' },
  { route: '/admin/kyc', klass: 'never', why: 'staff only' },
  { route: '/admin/login', klass: 'never', why: 'staff only' },
  { route: '/admin/marketplace', klass: 'never', why: 'staff only' },
  { route: '/admin/network', klass: 'never', why: 'staff only' },
  { route: '/admin/notifications', klass: 'never', why: 'staff only' },
  { route: '/admin/orders', klass: 'never', why: 'staff only' },
  { route: '/admin/orders/[orderId]', klass: 'never', why: 'staff only' },
  { route: '/admin/orders/unfulfilled', klass: 'never', why: 'staff only' },
  { route: '/admin/organisers', klass: 'never', why: 'staff only' },
  { route: '/admin/organisers/[id]', klass: 'never', why: 'staff only' },
  { route: '/admin/payouts', klass: 'never', why: 'staff only' },
  { route: '/admin/payouts/[orgId]', klass: 'never', why: 'staff only' },
  { route: '/admin/pricing', klass: 'never', why: 'staff only' },
  { route: '/admin/refunds', klass: 'never', why: 'staff only' },
  { route: '/admin/search', klass: 'never', why: 'staff only' },
  { route: '/admin/staff', klass: 'never', why: 'staff only' },
  { route: '/admin/staff/[id]', klass: 'never', why: 'staff only' },
  { route: '/admin/users', klass: 'never', why: 'staff only' },
  { route: '/admin/users/[id]', klass: 'never', why: 'staff only' },
  { route: '/admin/venues', klass: 'never', why: 'staff only' },
  { route: '/artist/dashboard', klass: 'never', why: 'authenticated' },
  { route: '/artists/claim/[token]', klass: 'never', why: 'a one-time claim token' },
  { route: '/auth/reset-password', klass: 'never', why: 'authentication' },
  { route: '/checkout/[reservation_id]', klass: 'never', why: 'transactional' },
  { route: '/dashboard', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/api-keys', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/create', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/attendees', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/discounts', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/edit', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/launch-kit', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/lineup', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/orders', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/orders/[orderId]', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/pricing', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/reach', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/refunds', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/seats', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/events/[id]/stream', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/gigs', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/gigs/[id]', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/insights', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/invites', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/my-squads', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/my-waitlists', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/organisation', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/organisation/create', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/payouts', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/reports/gst', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/tickets', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/venues', klass: 'never', why: 'authenticated' },
  { route: '/dashboard/venues/[id]/seat-maps', klass: 'never', why: 'authenticated' },
  { route: '/design/cards', klass: 'never', why: 'a developer preview' },
  { route: '/gigs/[id]', klass: 'never', why: 'a gig posting: the page has declared index:false for itself since it shipped, so the platform already keeps the board out of the index; recorded here rather than reversed' },
  { route: '/dev/logo-preview', klass: 'never', why: 'a developer preview' },
  { route: '/dev/shell-preview', klass: 'never', why: 'a developer preview' },
  { route: '/events/[slug]/holder', klass: 'never', why: 'a ticket holder view, bearer gated' },
  { route: '/feed', klass: 'never', why: 'the personalised feed, signed in only' },
  { route: '/forgot-password', klass: 'never', why: 'authentication' },
  { route: '/join/[code]', klass: 'never', why: 'a one-time invite code' },
  { route: '/launch/k/[code]', klass: 'never', why: 'a tracked Launch Kit share link' },
  { route: '/launch/with/[code]', klass: 'never', why: 'a tracked Launch Kit share link' },
  { route: '/login', klass: 'never', why: 'authentication' },
  { route: '/orders/[order_id]/confirmation', klass: 'never', why: 'transactional, and it carries a buyer name' },
  { route: '/organisers/signup', klass: 'never', why: 'authentication' },
  { route: '/queue/[slug]', klass: 'never', why: 'transactional, a waiting room' },
  { route: '/scan/[eventId]', klass: 'never', why: 'the door scanner, staff only' },
  { route: '/signup', klass: 'never', why: 'authentication' },
  { route: '/squad/[token]', klass: 'never', why: 'transactional, a bearer token' },
  { route: '/squad/[token]/pay/[member_id]', klass: 'never', why: 'transactional, a bearer token' },
  { route: '/t/[code]', klass: 'never', why: 'a bearer ticket' },
  { route: '/t/[code]/watch', klass: 'never', why: 'a bearer ticket stream' },
  { route: '/tickets', klass: 'never', why: 'signed in only' },
  { route: '/marketing/preferences', klass: 'never', why: 'a privacy rights form, linked from the privacy policy and from every message rather than from search' },
  { route: '/marketing/preferences/[token]', klass: 'never', why: 'one person consent history behind their own message token' },
  { route: '/unsubscribe/[token]', klass: 'never', why: 'a one-time token' },
  { route: '/unsubscribe/digest/[token]', klass: 'never', why: 'a one-time token' },
  { route: '/unsubscribe/recovery/[token]', klass: 'never', why: 'a one-time token' },
  { route: '/verify-email-sent', klass: 'never', why: 'authentication' },
  { route: '/waitlist/unsubscribe/[token]', klass: 'never', why: 'a one-time token' },
]

const BY_ROUTE = new Map(INDEXING_POLICY.map(e => [e.route, e]))

/** The class of a route as written under src/app, or undefined if unclassified. */
export function classifyRoute(route: string): IndexingClass | undefined {
  return BY_ROUTE.get(route)?.klass
}

/** Every route carrying a given class. Used by the guards and the tests. */
export function routesWithClass(klass: IndexingClass): string[] {
  return INDEXING_POLICY.filter(e => e.klass === klass).map(e => e.route)
}

/**
 * THE ONE noindex BLOCK. Every NEVER route spreads this into its metadata, and
 * the guard fails the build if one stops doing so.
 *
 * `nofollow` as well as `noindex`, because these pages link to more of
 * themselves and there is nothing behind them a crawler should spend a budget
 * on. No canonical: a noindex page that also names a canonical is sending a
 * crawler two instructions at once about a page it has been told to ignore.
 */
export function noIndexMetadata() {
  return {
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  } as const
}

/**
 * THE ONE alias BLOCK. A second address for a page that lives elsewhere: never
 * indexed, and pointing at the page it is an alias for. `follow` stays true so
 * a crawler walks through to the real page.
 */
export function aliasMetadata(canonicalPath: string) {
  return {
    robots: {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    },
    alternates: { canonical: canonicalPath },
  } as const
}

/**
 * THE ONE CONDITIONAL BLOCK. A templated discovery page is indexable exactly
 * when it holds at least DISCOVERY_INDEXING_THRESHOLD publicly visible events.
 * The canonical is self-referencing in both states, because the URL is its own
 * page whether or not anything is on: pointing it elsewhere while empty is what
 * produced Search Console's "Google chose different canonical" report.
 */
export function discoveryIndexing(eventCount: number, canonicalPath: string, threshold: number) {
  const indexable = isDiscoveryIndexable(eventCount, threshold)
  return {
    robots: {
      index: indexable,
      follow: true,
      googleBot: { index: indexable, follow: true },
    },
    alternates: { canonical: canonicalPath },
  } as const
}

/**
 * Whether a count clears the threshold. The sitemap and the pages share it.
 *
 * THE THRESHOLD IS A REQUIRED ARGUMENT AND HAS NO DEFAULT, deliberately. It used
 * to read the constant itself, and once the owner could move the number (SEO3
 * step 2) a default would have meant a call site that forgot to pass the LIVE
 * value silently kept using the compiled one. The two would then disagree, a
 * page would say noindex while the sitemap published it, and that contradiction
 * is exactly what Search Console reports back as an exclusion. With no default
 * the compiler finds every call site instead.
 */
export function isDiscoveryIndexable(eventCount: number, threshold: number): boolean {
  return eventCount >= threshold
}

/**
 * WHETHER AN ORGANISER PROFILE IS WORTH INDEXING (close-out SEO3 step 7).
 *
 * The item names the rule exactly: "Set /organisers/oanh and any other organiser
 * profile with zero events and no biography to noindex, follow under the same
 * substance rule, so empty profiles stop entering the index."
 *
 * So there are TWO ways a profile is substantive and it needs only one of them:
 * it holds events, judged on the same live threshold every discovery page is
 * judged on, OR somebody has written a biography. A profile with a written
 * biography and no events on sale is a real page about a real organisation; a
 * profile with neither is a name and a logo, which is the thin page Search
 * Console reports back.
 *
 * WHY THIS IS NOT `isDiscoveryIndexable` WITH THE COUNT NUDGED UP. Passing
 * `hasBiography ? threshold : count` would make the rule true by lying about the
 * count, and the next person reading the call site would have no way to tell
 * which of the two reasons made the page indexable. The rule is written down
 * instead.
 */
export function isOrganiserProfileIndexable(
  eventCount: number,
  hasBiography: boolean,
  threshold: number,
): boolean {
  return hasBiography || isDiscoveryIndexable(eventCount, threshold)
}

/**
 * The metadata block for an organiser profile. Self-canonical in both states,
 * for the same reason every conditional page is: the URL is its own page whether
 * or not anything is on it.
 */
export function organiserIndexing(
  eventCount: number,
  hasBiography: boolean,
  canonicalPath: string,
  threshold: number,
) {
  const indexable = isOrganiserProfileIndexable(eventCount, hasBiography, threshold)
  return {
    robots: {
      index: indexable,
      follow: true,
      googleBot: { index: indexable, follow: true },
    },
    alternates: { canonical: canonicalPath },
  } as const
}
