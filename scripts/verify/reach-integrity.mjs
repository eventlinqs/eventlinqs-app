/**
 * REACH INTEGRITY. The gate for the defect class that has no gate.
 *
 * The class: a feature exists, is written correctly, passes its tests, returns
 * 200, renders its designed empty state, and can NEVER FIRE, because nothing
 * upstream populates the thing it selects on. Types pass. Lint passes. Unit
 * tests pass. Nobody finds out until an organiser asks why their event did not
 * reach anyone.
 *
 * The weekly digest read `events.city_primary`. Nothing in the organiser path
 * ever wrote `events.city_primary`. That survived every gate this platform has.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF CHECK, AND WHY BOTH ARE NEEDED
 *
 * CODE checks ask: is the link severed in the source? They are independent of
 * traffic, so they are true on day zero with an empty database. This is where
 * most of this file's value is, because a launching platform has no data to
 * measure and a data-only harness would report a clean bill of health on an
 * empty database. That is the trap.
 *
 * DATA checks ask: of the rows that SHOULD satisfy this feature, how many do?
 * They catch the drift a code check cannot see (a column that stopped being
 * written, a backfill that missed a shape).
 *
 * THE DISTINCTION THAT MAKES THIS HONEST: a data check separates a STRUCTURAL
 * zero (nothing can ever satisfy this) from an EMPTY zero (nothing does yet,
 * because there is no traffic). Failing a digest for having no subscribers on a
 * pre-launch platform would train everyone to ignore this harness inside a
 * week. So a data check reports EMPTY when its universe is zero, and only FAILS
 * when the universe is non-zero and the addressable population is not.
 *
 * ---------------------------------------------------------------------------
 * WHICH DATABASE
 *
 * PRODUCTION is the authoritative target. This harness exists because a
 * previous measurement was taken on TEST, reported as a finding, and drove the
 * wrong priority: TEST said 8.8 percent of published events could reach their
 * own city, production said 84 percent. A harness that only ever measured the
 * convenient database would have reproduced that error exactly.
 *
 *   node scripts/verify/reach-integrity.mjs                 # TEST  (CI)
 *   node scripts/verify/reach-integrity.mjs --production    # LIVE  (authority)
 *   node scripts/verify/reach-integrity.mjs --code-only     # no database needed
 *
 * Production access is READ ONLY and structurally so: the client is proxied and
 * insert, update, upsert and delete throw before reaching the network.
 *
 * Exit code is 1 if any check FAILS. That is deliberate: the founder's ruling
 * is that a feature whose addressable population is zero fails the build, it
 * does not warn.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, readdirSync } from 'node:fs'

const ROOT = process.cwd()
const args = process.argv.slice(2)
const PRODUCTION = args.includes('--production')
const CODE_ONLY = args.includes('--code-only')
const VERBOSE = args.includes('--verbose')

// ---------------------------------------------------------------------------
// Repo access for CODE checks.
// ---------------------------------------------------------------------------
function src(relative) {
  const path = `${ROOT}/${relative}`
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

/** Strip comments so a check can never be satisfied by a mention in prose. */
function code(relative) {
  const raw = src(relative)
  if (raw === null) return null
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

/**
 * Every query parameter that appears in a real, clickable link to the PUBLIC
 * /events browse surface.
 *
 * Three things this has to get right, each learnt from getting it wrong:
 *   - comments are stripped first, so a parameter mentioned only in a doc
 *     comment (`sub`, in sub-communities-rail.tsx) is not reported as a live
 *     defect. A check that cries wolf gets ignored;
 *   - the path is anchored to a quote or backtick, so `/admin/events?q=` and
 *     `/dashboard/events?tab=` are not mistaken for the public surface. They
 *     are different routes with their own parsers;
 *   - /events/browse/[city] shares the parser, so its links count too.
 */
function emittedEventsParams() {
  const found = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) {
        const text = code(path.slice(ROOT.length + 1))
        if (!text) continue
        for (const match of text.matchAll(/["'`]\/events(?:\/browse\/[^"'`\s?]*)?\?([^"'`\s)]+)/g)) {
          for (const pair of match[1].split('&')) {
            const key = pair.split('=')[0].replace(/[^a-zA-Z_]/g, '')
            if (key) found.add(key)
          }
        }
      }
    }
  }
  walk(`${ROOT}/src`)
  return found
}

// ---------------------------------------------------------------------------
// Database access for DATA checks.
// ---------------------------------------------------------------------------
function loadEnv(file) {
  if (!existsSync(`${ROOT}/${file}`)) return {}
  return Object.fromEntries(
    readFileSync(`${ROOT}/${file}`, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
      }),
  )
}

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PROD_REF = 'gndnldyfudbytbboxesk'

function connect() {
  const env = loadEnv(PRODUCTION ? '.env.local' : '.env.test')
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const wanted = PRODUCTION ? PROD_REF : TEST_REF
  if (!url?.includes(wanted)) {
    throw new Error(
      `Refusing to run: expected ${PRODUCTION ? 'PRODUCTION' : 'TEST'} (${wanted}) but the env points at ${url}`,
    )
  }
  const raw = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const FORBIDDEN = ['insert', 'update', 'upsert', 'delete', 'rpc']
  return {
    label: PRODUCTION ? `PRODUCTION ${url}` : `TEST ${url}`,
    from(table) {
      const builder = raw.from(table)
      return new Proxy(builder, {
        get(target, prop) {
          if (typeof prop === 'string' && FORBIDDEN.includes(prop)) {
            throw new Error(`reach-integrity is READ ONLY: refusing ${prop}() on ${table}`)
          }
          const v = Reflect.get(target, prop)
          return typeof v === 'function' ? v.bind(target) : v
        },
      })
    },
  }
}

/**
 * Count rows, and treat a null count as a FAILED QUERY even when the error
 * carries no message.
 *
 * Found by reading this harness's own output: `.eq('status','paid')` on orders
 * returns HTTP 400 with error.message === '' because 'paid' is not a value of
 * the order_status enum. An empty string is falsy, so `if (error)` passed, the
 * null count flowed into the verdict, and the check reported a confident
 * failure about a query that never ran. That is precisely the defect class this
 * file exists to catch, occurring inside this file.
 */
async function countOf(db, table, apply = (q) => q) {
  const res = await apply(db.from(table).select('id', { count: 'exact', head: true }))
  if (res.error || res.count === null || res.count === undefined) {
    const why = res.error?.message || `query returned no count (HTTP ${res.status ?? '?'})`
    return { count: null, error: `${table}: ${why}` }
  }
  return { count: res.count }
}

// ---------------------------------------------------------------------------
// Verdicts.
// ---------------------------------------------------------------------------
const PASS = (note) => ({ verdict: 'PASS', note })
const FAIL = (note) => ({ verdict: 'FAIL', note })
const EMPTY = (note) => ({ verdict: 'EMPTY', note })
const SKIP = (note) => ({ verdict: 'SKIP', note })

/**
 * The standard data verdict. universe is the population that SHOULD be
 * reachable; addressable is the population that actually is.
 */
function coverage(addressable, universe, note, floor = 1) {
  if (universe === 0) return EMPTY(`nothing to measure yet (universe 0). ${note}`)
  const ratio = addressable / universe
  const pct = (ratio * 100).toFixed(1)
  if (addressable === 0) return FAIL(`0 of ${universe} addressable. ${note}`)
  if (ratio < floor) {
    return FAIL(`${addressable} of ${universe} addressable (${pct} percent). ${note}`)
  }
  return PASS(`${addressable} of ${universe} addressable (${pct} percent)`)
}

// ---------------------------------------------------------------------------
// THE CHECKS
// ---------------------------------------------------------------------------
const CHECKS = [
  // ---------------------------------------------------------------- CODE ---
  {
    id: 'newsletter-persists',
    kind: 'code',
    feature: 'The "get {City} events weekly" capture on 20 city landings, 420 community-by-city pages and every organiser profile',
    selectsOn: 'whatever /api/newsletter/subscribe writes',
    run() {
      const route = code('src/app/api/newsletter/subscribe/route.ts')
      if (!route) return FAIL('the endpoint is missing entirely')
      const persists = /\b(recordPlatformDigestConsent|from\(\s*['"](marketing_consents|email_subscribers)['"]\s*\))/.test(route)
      if (!persists) {
        return FAIL(
          'the endpoint validates, logs, and returns ok WITHOUT storing the address, while the component tells the person "Subscribed". Every address typed into it is discarded',
        )
      }
      const hasConsentWording = /consent/i.test(route)
      if (!hasConsentWording) {
        return FAIL('the address is stored but no consent wording is recorded with it (Spam Act: the wording shown must be the wording kept)')
      }
      return PASS('the address is persisted with recorded consent')
    },
  },
  {
    id: 'scheduled-events-publish',
    kind: 'code',
    feature: 'Scheduling an event for a future date',
    selectsOn: 'events.scheduled_publish_at',
    run() {
      // Something, anywhere, must move a scheduled event to published.
      const candidates = [
        'src/app/api/cron/publish-scheduled/route.ts',
        'src/lib/events/publish-scheduled.ts',
      ]
      const publisher = candidates.map((c) => code(c)).find(Boolean)
      if (!publisher) {
        return FAIL(
          'nothing anywhere transitions a scheduled event to published. The wizard writes scheduled_publish_at and no cron, job or trigger ever reads it. The organiser finds out when nobody turns up',
        )
      }
      if (!/scheduled_publish_at/.test(publisher) || !/['"]published['"]/.test(publisher)) {
        return FAIL('a publisher exists but does not read scheduled_publish_at and set published')
      }
      const vercel = src('vercel.json')
      if (!vercel || !/publish-scheduled/.test(vercel)) {
        return FAIL('the publisher exists but is not scheduled in vercel.json, so it never runs')
      }
      return PASS('a scheduled publisher exists and is wired to a cron')
    },
  },
  {
    id: 'city-primary-written',
    kind: 'code',
    feature: 'The weekly city digest, city pages and every city-scoped surface',
    selectsOn: 'events.city_primary',
    run() {
      const actions = code('src/app/(dashboard)/dashboard/events/actions.ts')
      if (!actions) return FAIL('the event actions file is missing')
      const writes = (actions.match(/city_primary\s*:/g) ?? []).length
      if (writes === 0) {
        return FAIL('neither createEvent nor updateEvent writes city_primary, so every organiser-created event is invisible to its own city')
      }
      if (writes < 2) {
        return FAIL(`city_primary is written in ${writes} place, not both create and update, so an edit can strand an event`)
      }
      return PASS(`written on both create and update (${writes} sites)`)
    },
  },
  {
    id: 'suburb-primary-written',
    kind: 'code',
    feature: 'Suburb landing pages, /city/[slug]/[suburb]',
    selectsOn: 'events.suburb_primary',
    run() {
      const actions = code('src/app/(dashboard)/dashboard/events/actions.ts')
      if (!actions) return FAIL('the event actions file is missing')
      if (!/suburb_primary\s*:/.test(actions)) {
        return FAIL(
          'suburb_primary is never written by the organiser path, so every suburb page is permanently empty of organiser events. Note the fix is NOT the city fix: a suburb cannot be derived from a city name',
        )
      }
      return PASS('written by the organiser path')
    },
  },
  {
    id: 'url-filters-parsed',
    kind: 'code',
    feature: 'Every "View all" and "Open in browse view" link on city, community and home surfaces',
    selectsOn: 'parseEventsSearchParams',
    run() {
      const parser = code('src/lib/events/search-params.ts')
      if (!parser) return FAIL('the search-param parser is missing')

      // WHY THIS SCANS INSTEAD OF LISTING. The first version of this check
      // hardcoded nine parameter names. It was wrong in both directions: it
      // MISSED free, price, organiser, faith, moment and the invalid
      // sort=trending, and it COUNTED `sub`, which appears only in a comment.
      // A hardcoded list is a snapshot of one person's reading of the codebase
      // on one day, and this check exists precisely because that kind of drift
      // is invisible. So the emitted set is derived from the source every run.
      const emitted = emittedEventsParams()
      if (emitted.size === 0) {
        return FAIL('the scanner found no /events links at all, which means the scanner is broken, not the code')
      }
      // The parser reads each one as `raw.<param>`, so that is what proves it
      // is handled. Being exact about "handled" matters: a check that cries
      // wolf gets ignored inside a week.
      const unparsed = [...emitted].filter((p) => !new RegExp(`raw\\.${p}\\b`).test(parser)).sort()
      if (unparsed.length) {
        return FAIL(
          `${unparsed.length} of ${emitted.size} parameter(s) appear in links a user can click and are never parsed, so those links silently land on the unfiltered national list: ${unparsed.join(', ')}`,
        )
      }
      return PASS(`all ${emitted.size} parameters emitted in /events links are parsed`)
    },
  },
  {
    id: 'district-assignment-is-exclusive',
    kind: 'code',
    feature: 'Every /city/[slug]/[suburb] district page',
    selectsOn: 'the rule that decides which district an event belongs to',
    /**
     * THE DEFECT THIS EXISTS FOR, because it had no symptom at all.
     *
     * The suburb page and the /events?suburb= filter both once asked "is this
     * event within the district radius". That is INCLUSIVE, and an assignment
     * that is inclusive is not an assignment. Every Melbourne district sits
     * within 12 km of the CBD, and 43 of the 55 Melbourne events carry the CBD
     * centroid as their venue coordinate, so all six district pages returned
     * the same events. Nothing was empty, nothing was broken, nothing errored:
     * six pages each gave a wrong answer that looked exactly like a right one.
     *
     * A regression here would look like a feature working. So the gate is
     * structural: the three callers must resolve through resolveSuburbSlug, the
     * one function whose contract is "the single nearest district", and none of
     * them may reintroduce a bare radius comparison.
     */
    run() {
      const resolver = code('src/lib/cities/resolve-suburb.ts')
      if (!resolver) return FAIL('the district resolver is missing entirely')
      // ORDER BY distance / LIMIT 1 in prose form: the resolver must pick one.
      if (!/best\s*===?\s*null\s*\|\|\s*km\s*<\s*best\.km/.test(resolver)) {
        return FAIL(
          'resolveSuburbSlug no longer picks the single nearest district. If it now returns everything in range, every district page in a city returns the same events and each one is a wrong answer with no symptom',
        )
      }

      const callers = [
        ['the organiser write path', 'src/app/(dashboard)/dashboard/events/actions.ts'],
        ['the /events?suburb= filter', 'src/lib/events/fetchers.ts'],
        ['the district landing page', 'src/app/city/[slug]/[suburb]/page.tsx'],
      ]
      const missing = callers.filter(([, path]) => !/resolveSuburbSlug/.test(code(path) ?? ''))
      if (missing.length) {
        return FAIL(
          `${missing.length} of the 3 callers no longer decide the district through resolveSuburbSlug, so the write and the read can disagree about which district an event is in: ${missing.map(([label]) => label).join(', ')}`,
        )
      }

      // A bare radius comparison in the read paths is the exact shape of the
      // regression. The resolver itself is allowed one, which is why it is not
      // in this list.
      const inclusive = callers
        .filter(([label]) => label !== 'the organiser write path')
        .filter(([, path]) => /<=\s*SUBURB_(MATCH_)?RADIUS_KM/.test(code(path) ?? ''))
      if (inclusive.length) {
        return FAIL(
          `${inclusive.length} read path(s) compare against the district radius directly instead of resolving the nearest district: ${inclusive.map(([label]) => label).join(', ')}. That is the inclusive test that made every district page a copy of the city page`,
        )
      }
      return PASS('all 3 callers resolve the single nearest district, and no read path tests the radius directly')
    },
  },
  {
    id: 'category-landing-filters-in-query',
    kind: 'code',
    feature: 'Category landing pages, /categories/[slug]',
    selectsOn: 'the category filter position in the query',
    run() {
      const page = code('src/app/categories/[slug]/page.tsx')
      if (!page) return SKIP('the category landing page is not at the expected path')
      // The defect shape: take the N soonest events platform-wide, THEN filter
      // by category in JavaScript. A category page then shows an event only if
      // that event is among the soonest on the whole platform.
      const filtersInJs = /\.filter\(\s*\(?\s*\w+\s*\)?\s*=>[^)]*categor/i.test(page)
      const filtersInQuery = /\.eq\(\s*['"]category_id['"]|category_id\s*,/.test(page)
      if (filtersInJs && !filtersInQuery) {
        return FAIL(
          'the query takes the soonest events platform-wide and only then filters by category in JavaScript, so a category page shows an event only when it happens to be among the soonest on the entire platform. Structurally almost always empty',
        )
      }
      return PASS('the category filter is applied in the query')
    },
  },
  {
    id: 'search-matches-more-than-title',
    kind: 'code',
    feature: 'The header search box, its four tabs, and all 12 homepage Sounds tiles',
    selectsOn: 'the search predicate in fetchers.ts',
    run() {
      const fetchers = code('src/lib/events/fetchers.ts')
      if (!fetchers) return FAIL('the event fetchers file is missing')

      // WHY THIS READS ONE FUNCTION RATHER THAN THE WHOLE FILE. The first
      // version asked whether the file contained `ilike('title'` and no wider
      // `.or(...)`. A refactor that moved the same title-only predicate into a
      // returned operation object stopped matching that pattern and the check
      // went green while the defect was untouched: a false clean bill of health
      // produced by a change that had nothing to do with search. So the check
      // now locates the ONE function that builds the predicate and reads it.
      const fn = fetchers.match(/function buildSearchOp[\s\S]*?\n}/)
      if (!fn) {
        return FAIL(
          'cannot locate buildSearchOp, the single source of the search predicate. Either it was renamed (update this check with it) or search has been scattered across call sites again',
        )
      }
      const wider = /(summary|description|venue_name|venue_city|tags)/.test(fn[0])
      if (!wider) {
        return FAIL(
          'search is a substring match on the event title and nothing else, so a multi-word Sounds tile such as "afrobeats amapiano" matches only a title containing that literal string. Nine of twelve tiles and three of four search tabs are dead ends',
        )
      }
      return PASS('the search predicate matches beyond the title')
    },
  },
  {
    id: 'follow-write-matches-alert-read',
    kind: 'code',
    feature: 'Just-announced alerts to people who follow an organiser',
    selectsOn: 'saved_organisers / follows',
    run() {
      const writer = code('src/app/actions/follow.ts')
      const reader = code('src/app/api/cron/notify-just-announced/route.ts')
      if (!writer || !reader) return SKIP('follow action or alert cron not at the expected path')
      const writesSaved = /saved_organisers/.test(writer)
      const readsSaved = /saved_organisers/.test(reader)
      if (readsSaved && !writesSaved) {
        return FAIL(
          'the alert cron reads saved_organisers and the follow button never writes it, so following an organiser produces no alerts and looks identical to having no followers',
        )
      }
      return PASS('the follow button writes the table the alert cron reads')
    },
  },
  {
    id: 'digest-links-are-tracked',
    kind: 'code',
    feature: 'Attributing what the weekly city email actually sold',
    selectsOn: "share_links.channel = 'digest'",
    run() {
      const digest = code('src/lib/broadcast/digest.ts')
      const codes = code('src/lib/broadcast/share-codes.ts')
      if (!digest || !codes) return FAIL('the digest or share-code module is missing')
      if (!/['"]digest['"]/.test(codes)) return FAIL("'digest' is not a known share channel")
      if (!/getOrCreateShareLink/.test(digest)) {
        return FAIL('the digest does not mint tracked links, so the one channel the platform controls produces no evidence it worked')
      }
      return PASS('the digest carries tracked links')
    },
  },

  // ---------------------------------------------------------------- DATA ---
  {
    id: 'city-primary-coverage',
    kind: 'data',
    feature: 'Published events that can reach their own city',
    selectsOn: 'events.city_primary',
    async run(db) {
      const { data: cities } = await db.from('cities').select('slug, name')
      const norm = (s) =>
        (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const known = new Set([...cities.map((c) => norm(c.name)), ...cities.map((c) => norm(c.slug))])

      const rows = []
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from('events')
          .select('slug, venue_city, city_primary')
          .eq('status', 'published')
          .range(from, from + 999)
        if (!data?.length) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      // Universe: published events whose typed locality IS a city we list.
      // An event in a town we have no page for is not a failure.
      const universe = rows.filter((e) => known.has(norm((e.venue_city ?? '').split(',')[0])))
      const addressable = universe.filter((e) => e.city_primary)
      return coverage(
        addressable.length,
        universe.length,
        'each unaddressable event carries a locality we DO have a city page for and still cannot appear in that city digest',
      )
    },
  },
  {
    id: 'digest-audience-reachable',
    kind: 'data',
    feature: 'People who consented to the weekly digest and can actually receive it',
    selectsOn: 'marketing_consents.city_slug',
    async run(db) {
      const granted = await countOf(db, 'marketing_consents', (q) => q.eq('status', 'granted'))
      if (granted.error) return SKIP(granted.error)
      const withCity = await countOf(db, 'marketing_consents', (q) =>
        q.eq('status', 'granted').not('city_slug', 'is', null),
      )
      return coverage(
        withCity.count,
        granted.count,
        'a granted consent with a null city can never be selected by any city digest: consent captured, person unreachable',
      )
    },
  },
  {
    id: 'share-conversions-fire',
    kind: 'data',
    feature: 'The reach panel showing tickets sold per channel, the Launch Kit\'s central claim',
    selectsOn: "share_link_events.kind = 'conversion'",
    async run(db) {
      // The completed-order statuses, from the order_status enum in the
      // baseline schema. There is no 'paid': a check written against a status
      // that cannot exist fails forever and tells you nothing.
      const COMPLETED = ['confirmed', 'partially_refunded', 'refunded']
      const paid = await countOf(db, 'orders', (q) => q.in('status', COMPLETED))
      if (paid.error) return SKIP(paid.error)
      const conversions = await countOf(db, 'share_link_events', (q) => q.eq('kind', 'conversion'))
      const clicks = await countOf(db, 'share_link_events', (q) => q.eq('kind', 'click'))
      if (conversions.error || clicks.error) return SKIP(conversions.error ?? clicks.error)
      if (paid.count === 0) {
        return EMPTY(
          `no paid order has ever existed here (${clicks.count} clicks recorded), so a zero conversion count proves nothing either way. This must be settled by driving a real paid purchase through a tracked link, not by reading this number`,
        )
      }
      return coverage(
        conversions.count,
        paid.count,
        'paid orders exist and none is attributed to a share link. The reach panel shows clicks with no revenue beside them, which reads to an organiser as "your sharing did not work" rather than as broken',
        0.0001,
      )
    },
  },
  {
    id: 'share-view-beacon-fires',
    kind: 'data',
    feature: 'The views column of the reach panel',
    selectsOn: "share_link_events.kind = 'view'",
    async run(db) {
      const clicks = await countOf(db, 'share_link_events', (q) => q.eq('kind', 'click'))
      const views = await countOf(db, 'share_link_events', (q) => q.eq('kind', 'view'))
      if (clicks.error) return SKIP(clicks.error)
      if (clicks.count === 0) return EMPTY('no clicks recorded yet')

      // THE QUESTION THIS CHECK ASKS, corrected 8 August 2026.
      //
      // It used to fail when views were under a tenth of clicks, and its own
      // note admitted it could not tell "the beacon is broken" from "most
      // clicks are scanners". Those are completely different findings and only
      // one of them belongs in a harness about severed features. Investigated
      // on production: all 57 clicks were on facebook and x links across 55
      // distinct visitor hashes, and 3 views existed. A crawler fleet, and a
      // beacon that demonstrably fires.
      //
      // So the question is now the one this harness is for: CAN the beacon
      // fire? Any view proves the whole path works, because a view can only
      // exist if a real browser ran the script, kept the cookie, and the
      // endpoint accepted it. Zero views against real clicks is the severed
      // case, and that still fails.
      //
      // The ratio is still reported, because it is the honest picture of
      // traffic composition, but a low ratio is a fact about the audience and
      // not a broken feature. Crawler hits are no longer recorded as clicks at
      // all (src/lib/broadcast/crawlers.ts), so this ratio becomes meaningful
      // for traffic arriving after that change.
      if (views.count === 0) {
        return FAIL(
          `0 views against ${clicks.count} clicks. Every click lands on an event page that should fire the view beacon, and not one has ever fired, so the views column of the reach panel is structurally empty`,
        )
      }
      const pct = ((views.count / clicks.count) * 100).toFixed(1)
      return PASS(
        `${views.count} views against ${clicks.count} clicks (${pct} percent). The beacon fires; the ratio is a fact about who is clicking, not a severed feature`,
      )
    },
  },
  {
    id: 'community-tag-coverage',
    kind: 'data',
    feature: 'The live-events rail on all 21 community landings and 420 community-by-city pages',
    selectsOn: 'events.tags',
    async run(db) {
      const rows = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from('events')
          .select('slug, tags')
          .eq('status', 'published')
          .range(from, from + 999)
        if (error) return SKIP(error.message)
        if (!data?.length) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      const tagged = rows.filter((e) => Array.isArray(e.tags) && e.tags.length > 0)
      return coverage(
        tagged.length,
        rows.length,
        'an untagged event appears on no community page, and the community rails fall through to the empty state while the code is perfect',
        0.05,
      )
    },
  },
  {
    id: 'push-subscribers-exist',
    kind: 'data',
    feature: 'Web push alerts, stated as the primary alert channel at about 5x email',
    selectsOn: 'push_subscriptions',
    async run(db) {
      const subs = await countOf(db, 'push_subscriptions')
      if (subs.error) return SKIP(subs.error)
      if (subs.count === 0) {
        return EMPTY(
          'no push subscribers. Not a failure with no traffic, but if this stays zero once people visit, the browser permission prompt is never being surfaced and every push alert is silently an email',
        )
      }
      return PASS(`${subs.count} subscribers`)
    },
  },
  {
    id: 'featured-events-exist',
    kind: 'data',
    feature: 'Any surface selecting on is_featured',
    selectsOn: 'events.is_featured',
    async run(db) {
      const featured = await countOf(db, 'events', (q) => q.eq('is_featured', true))
      if (featured.error) return SKIP(featured.error)
      const published = await countOf(db, 'events', (q) => q.eq('status', 'published'))
      if (published.count === 0) return EMPTY('no published events')
      if (featured.count === 0) {
        return EMPTY(
          'nothing is flagged featured, and the organiser path never writes the column. Whatever reads it renders nothing',
        )
      }
      return PASS(`${featured.count} featured of ${published.count} published`)
    },
  },
  {
    id: 'flags-off-by-oversight',
    kind: 'data',
    feature: 'Every feature that is built, wired and proven but sitting behind a flag nobody flipped',
    selectsOn: 'feature_flags.enabled',
    async run(db) {
      const { data, error } = await db.from('feature_flags').select('flag, enabled').order('flag')
      if (error) return SKIP(error.message)
      const off = (data ?? []).filter((f) => !f.enabled)
      if (off.length === 0) return PASS('every flag is on')

      const oversight = off.filter((f) => (FLAG_INTENT[f.flag]?.intent ?? 'UNDECLARED') !== 'deliberate')
      const lines = off.map((f) => {
        const i = FLAG_INTENT[f.flag]
        return `    ${f.flag}: ${i ? `${i.intent.toUpperCase()} - ${i.why}` : 'UNDECLARED - nobody has recorded whether this is a decision or an oversight, which is itself the defect'}`
      })
      const body = `${off.length} flag(s) off. A feature that is built, wired and proven but sitting behind a flag nobody flipped is the same silent break as one with no audience: nothing errors, nothing goes red, it simply never runs.\n${lines.join('\n')}`

      if (oversight.length) {
        return FAIL(
          `${body}\n  ${oversight.length} of these is NOT a deliberate decision and needs one.`,
        )
      }
      return EMPTY(
        `${body}\n  All deliberate. The code behind each has still never run against real data, so a defect of this class inside them is undiscovered rather than absent.`,
      )
    },
  },
]

/**
 * Declared intent per flag. A flag that is off with no recorded reason is a
 * defect in its own right, because "off" and "off by oversight" are
 * indistinguishable from the outside and only one of them is a decision.
 *
 * Founder rulings are the authority here. Update this when one changes.
 */
const FLAG_INTENT = {
  broadcast_digest: {
    intent: 'oversight',
    why: 'founder ruling 2026-08-08: "it should be ON. It is off because flags default to false and nobody flipped it once the digest was finished." Held until the newsletter capture is fixed and the waitlist bridge is merged, so the pipe is whole before the tap opens. In the production approval block, not to be flipped by an agent',
  },
  broadcast_follow: {
    intent: 'oversight',
    why: 'founder ruling 2026-08-08, session 3: "ON, and this is the priority. Collecting a follow graph a visitor can neither see nor withdraw is a privacy defect, not a missing feature." The evidence that settled it: with the flag off the follow button on the event page is UNGATED and live, the row IS written to saved_organisers, and the just-announced cron DOES read it, while the Following section on /account/notifications is gated, so the person can neither see who they follow nor unfollow. In the production approval block, not to be flipped by an agent',
  },
  broadcast_artists: {
    intent: 'oversight',
    why: 'founder ruling 2026-08-08, session 3: "ON. Built, wired across 14 sites failing closed, proven with attribution splitting. I accept the consequence that it publishes a public page per tagged performer; that is the point of the lineup loop." Proof: docs/broadcast/evidence/artist-switch-on-2026-07-11/gate.json. In the production approval block, not to be flipped by an agent',
  },
  artist_showcase: {
    intent: 'deliberate',
    why: 'performer marketplace, shipped behind a flag pending a launch decision',
  },
  gig_board: {
    intent: 'deliberate',
    why: 'performer marketplace, shipped behind a flag pending a launch decision',
  },
  community_giving: {
    intent: 'deliberate',
    why: 'parked by the constitution: the community-support statement is built only after a real audited donation programme exists',
  },
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------
const db = CODE_ONLY ? null : connect()
console.log('REACH INTEGRITY')
console.log(`target: ${CODE_ONLY ? 'code only, no database' : db.label}`)
console.log(
  PRODUCTION
    ? 'PRODUCTION is the authoritative target. Read only, enforced by proxy.\n'
    : CODE_ONLY
      ? ''
      : 'TEST. Run with --production for the authoritative measurement.\n',
)

const results = []
for (const check of CHECKS) {
  if (check.kind === 'data' && CODE_ONLY) continue
  let outcome
  try {
    outcome = check.kind === 'code' ? check.run() : await check.run(db)
  } catch (err) {
    outcome = FAIL(`the check itself threw: ${err.message}`)
  }
  results.push({ ...check, ...outcome })
}

const ICON = { PASS: 'PASS ', FAIL: 'FAIL ', EMPTY: 'empty', SKIP: 'skip ' }
for (const r of results) {
  console.log(`[${ICON[r.verdict]}] ${r.id}  (${r.kind})`)
  if (r.verdict !== 'PASS' || VERBOSE) {
    console.log(`         feature   : ${r.feature}`)
    console.log(`         selects on: ${r.selectsOn}`)
  }
  if (r.note) {
    for (const line of wrap(r.note, 88)) console.log(`         ${line}`)
  }
}

/** Wrap for reading, preserving the author's own line breaks. A note that
 * lists one flag per line must print one flag per line: the first version
 * collapsed them into a wall and the flag states became unreadable. */
function wrap(text, width) {
  const out = []
  for (const paragraph of String(text).split('\n')) {
    const indent = paragraph.match(/^\s*/)[0]
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      if ((line + ' ' + w).trim().length > width) {
        out.push(indent + line.trim())
        line = w
      } else line += ' ' + w
    }
    if (line.trim()) out.push(indent + line.trim())
  }
  return out
}

const failed = results.filter((r) => r.verdict === 'FAIL')
const empty = results.filter((r) => r.verdict === 'EMPTY')
console.log(
  `\n${results.filter((r) => r.verdict === 'PASS').length} pass, ${failed.length} FAIL, ${empty.length} empty, ${results.filter((r) => r.verdict === 'SKIP').length} skipped`,
)
if (empty.length) {
  console.log(
    '\n"empty" is not a pass and not a failure: there is nothing to measure yet. Each one becomes a real\nmeasurement the moment traffic arrives, and none of them should be read as a clean bill of health.',
  )
}
if (failed.length) {
  console.log('\nSEVERED. Each of these is a feature that cannot fire:')
  for (const f of failed) console.log(`  ${f.id}: ${f.feature}`)
}
process.exit(failed.length ? 1 : 0)
