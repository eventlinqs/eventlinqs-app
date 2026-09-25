/**
 * WHAT A FIXTURE PUBLISHES TO THE SITEMAP, ASKED OF THE DATABASE RATHER THAN
 * ARGUED FROM THE SOURCE.
 *
 * WHY THIS EXISTS, from the incident rather than from a principle. On
 * 14 September 2026 lane A's pre-push gate was refused at step 13 of 16 by two
 * lines it had no way to have caused:
 *
 *     [indexing-drive] FAIL: RULE 2: /organisers/lane-b-pl1-org-202609141153
 *                            is in the sitemap and answered 404
 *     [indexing-drive] FAIL: RULE 2: /venues/lane-b-pl1-warehouse
 *                            is in the sitemap and answered 404
 *     [gate] BLOCKED at indexing (exit 1) after 92s. Nothing was pushed.
 *
 * Both rows belonged to lane B's PL1 drive, which creates an organisation with
 * `status = 'active'` and an event with `visibility = 'public'`, drives them,
 * and deletes them at the end. THREE LANES SHARE ONE TEST DATABASE, so for the
 * minutes that fixture lived it was a real, published organiser profile and a
 * real, published venue page in everybody's sitemap. `src/app/sitemap.ts`
 * carries `export const revalidate = 300`, so the snapshot another lane's
 * server had already taken outlived the rows by up to five minutes, and every
 * URL in it answered 404.
 *
 * The gate was right. That is the exact shape the sitemap's own header records
 * from production on 25 August 2026, where a direct database purge left 48
 * advertised URLs answering 404 to Googlebot.
 *
 * THE RULE THAT FOLLOWS: a fixture must be invisible to discovery for its whole
 * life, not merely cleaned up afterwards. There is no window small enough. A
 * fixture organisation stays `pending` and a fixture event stays `unlisted`,
 * and both still do everything a drive needs: the event page renders for any
 * visibility except `private` (src/app/events/[slug]/page.tsx), and an
 * organisation is only ever read publicly through the RLS policy "Active
 * organisations are publicly browsable", so a pending one is simply absent
 * rather than broken.
 *
 * WHY THIS FILE IS A RUNTIME CHECK AND NOT ONLY A GUARD. The static guard
 * (scripts/guards/fixtures-are-not-published.mjs) reads the drives and refuses
 * the two literals. That is a claim about the source. THIS asks the database
 * the sitemap's own three questions and reports what would actually be
 * published, which is a claim about the world. The incident happened because a
 * claim about the world had never been made.
 *
 * THE THREE QUESTIONS ARE COPIED FROM src/app/sitemap.ts DELIBERATELY, and the
 * guard asserts that the copies still match, so this cannot quietly drift into
 * asking something the sitemap no longer asks.
 */

/** The sitemap's organiser predicate: `.not('slug','is',null).eq('status','active')`. */
export const SITEMAP_ORGANISER_STATUS = 'active'

/** The sitemap's event predicate: `.match(PUBLIC_EVENT_MATCH)`. */
export const SITEMAP_EVENT_MATCH = { status: 'published', visibility: 'public' }

/**
 * `venueSlugify`, character for character as src/lib/venues/resolver.ts defines
 * it. Copied rather than imported because this runs inside a plain node drive
 * process that may hold no alias loader, and NOT embellished: an earlier draft
 * of this file added NFKD normalisation and an ampersand rule the product does
 * not have, which would have made this answer a different question from the one
 * the sitemap asks. tests/unit/growth/sitemap-footprint.test.ts imports both and
 * asserts they agree, so the copy cannot drift in silence.
 */
export function venueHandle(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Ask the database, with the sitemap's own predicates, what a fixture would
 * publish. Returns the URLs the sitemap WOULD carry; an empty array is the only
 * acceptable answer for a fixture.
 *
 * @param db a supabase-js client holding the service role
 * @param {{organisationSlugs?: string[], eventSlugs?: string[], venueNames?: string[]}} fixture
 * @returns {Promise<string[]>} the sitemap paths this fixture would be published at
 */
export async function sitemapFootprint(db, fixture) {
  const organisationSlugs = (fixture.organisationSlugs ?? []).filter(Boolean)
  const eventSlugs = (fixture.eventSlugs ?? []).filter(Boolean)
  const venueNames = (fixture.venueNames ?? []).filter(Boolean)
  const published = []

  if (organisationSlugs.length > 0) {
    const { data, error } = await db
      .from('organisations')
      .select('slug')
      .in('slug', organisationSlugs)
      .eq('status', SITEMAP_ORGANISER_STATUS)
    if (error) throw new Error(`sitemap footprint, organisations: ${error.message}`)
    for (const row of data ?? []) published.push(`/organisers/${row.slug}`)
  }

  if (eventSlugs.length > 0) {
    const { data, error } = await db
      .from('events')
      .select('slug')
      .in('slug', eventSlugs)
      .match(SITEMAP_EVENT_MATCH)
    if (error) throw new Error(`sitemap footprint, events: ${error.message}`)
    for (const row of data ?? []) published.push(`/events/${row.slug}`)
  }

  /*
   * THE VENUE QUESTION IS NOT "DOES THIS VENUE EXIST". The sitemap derives a
   * venue handle from `events.venue_name` on every publicly visible event, so a
   * fixture publishes a venue page only while it holds a publicly visible event
   * naming that venue. A handle that ANOTHER, long-lived event also names is not
   * this fixture's footprint and does not disappear when the fixture does, which
   * is why this asks for the handle's publishers rather than for the name.
   */
  if (venueNames.length > 0) {
    const handles = new Set(venueNames.map(venueHandle).filter(Boolean))
    const { data, error } = await db
      .from('events')
      .select('venue_name')
      .match(SITEMAP_EVENT_MATCH)
      .not('venue_name', 'is', null)
      .limit(5000)
    if (error) throw new Error(`sitemap footprint, venues: ${error.message}`)
    const publishedHandles = new Set()
    for (const row of data ?? []) {
      const handle = venueHandle(row.venue_name)
      if (handle && handles.has(handle)) publishedHandles.add(handle)
    }
    for (const handle of publishedHandles) published.push(`/venues/${handle}`)
  }

  return published.sort()
}

/**
 * EVERYTHING THIS LANE'S FIXTURES STILL PUBLISH, whatever run made them.
 *
 * WHY THIS IS SEPARATE FROM sitemapFootprint. That function asks about THIS
 * run's rows and is the right question before a drive starts. It is the wrong
 * question afterwards, because the row that hurts somebody else is the one a
 * PREVIOUS run left behind, and no drive was asking about those.
 *
 * Found on 15 September 2026, by asking: `lane-b-ga5-event-202609131728` had
 * been published and public on shared TEST for two days, with an organisation,
 * four orders and three campaigns behind it. GA5's teardown counted
 * `marketing_campaign` rows only, so it reported 'left as found' every time
 * while a fixture event sat in the sitemap. The event could not be deleted
 * because it carries money records, which is the database enforcing
 * docs/EVENT-LIFECYCLE.md, and the drive never noticed the refusal.
 *
 * @param db a supabase-js client holding the service role
 * @param {string} prefix the lane's own slug prefix, eg 'lane-b-ga5-'
 * @returns {Promise<string[]>} the sitemap paths those rows would be published at
 */
export async function laneFixturesStillPublished(db, prefix) {
  if (!prefix || !/^lane-[abc]-/.test(prefix)) {
    throw new Error(`refusing to sweep on '${prefix}': a lane prefix is required so this can never read another lane's rows`)
  }
  const published = []

  const orgs = await db
    .from('organisations')
    .select('slug')
    .like('slug', `${prefix}%`)
    .eq('status', SITEMAP_ORGANISER_STATUS)
  if (orgs.error) throw new Error(`lane fixtures, organisations: ${orgs.error.message}`)
  for (const row of orgs.data ?? []) published.push(`/organisers/${row.slug}`)

  const events = await db
    .from('events')
    .select('slug, venue_name')
    .like('slug', `${prefix}%`)
    .match(SITEMAP_EVENT_MATCH)
  if (events.error) throw new Error(`lane fixtures, events: ${events.error.message}`)
  for (const row of events.data ?? []) {
    published.push(`/events/${row.slug}`)
    const handle = venueHandle(row.venue_name)
    if (handle) published.push(`/venues/${handle}`)
  }

  return [...new Set(published)].sort()
}
