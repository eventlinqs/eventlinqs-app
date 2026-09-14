/**
 * AN EVENT PAGE CAN NEVER SHIP WITHOUT ITS STRUCTURED DATA, AND WHAT IT SHIPS
 * HAS TO COME FROM THE DATABASE.
 *
 * Founder brief, 23 August 2026: "Guard it, so an event page can never ship
 * without valid structured data."
 *
 * SEO1, 13 September 2026, states the invariant this guard now holds: "every
 * published event page must emit exactly one valid schema.org Event JSON-LD
 * block whose name, startDate, location, organizer and offers all resolve to
 * values read from the database, and no unpublished event may emit any block at
 * all."
 *
 * WHAT CHANGED, AND WHY IT IS NOT A STYLE PREFERENCE. Until SEO1 this guard held
 * the WIRING alone, and said so honestly in its own header: it could see that
 * the page still rendered the component and that the component still existed. It
 * could not see a single VALUE. A serialiser that emitted a hard-coded price, or
 * that quietly stopped reading `startDate` from the row, passed it every time.
 *
 * That is exactly the class of defect SEO1 found in production. Nothing was
 * missing and nothing was mentioned in the wrong place; the values were simply
 * wrong. The markup emitted the raw UTC instant on a page that told a human
 * 12:00 pm AEDT, never emitted `postalCode` although the column was loaded, and
 * read `tier.price` while the page rendered `display_price_cents`, so any event
 * with a live price move advertised a figure nobody could buy at.
 *
 * So the guard EXECUTES the real serialiser now. It loads
 * src/lib/seo/event-schema.ts through scripts/lib/src-alias-loader.mjs (which is
 * why that module is pure and carries no JSX) and runs it over lane-C fixtures.
 *
 * SEO1 v2, 13 September 2026, SUPERSEDES SEO1 AND ADDS TWO CLAUSES. Its
 * invariant, in the owner's words: "every published event page emits exactly one
 * valid Event JSON-LD block whose fields resolve to database values; no
 * unpublished event emits any block; no listing page emits an Event block; and
 * the string [the attendance-mode property] appears nowhere in the repository."
 *
 * THE SEVEN CLAUSES, because any one alone is defeatable.
 *
 *   1. WIRING. The page still renders the emitter, still hands it the lineup,
 *      and still hands it the DISPLAYED tiers rather than the raw rows.
 *   2. ONE EMITTER. No raw `application/ld+json` script tag exists anywhere in
 *      src outside src/components/seo/json-ld.tsx. This is what makes SEO1's
 *      reversal condition ("one flag stops every block on every page type at
 *      once") true rather than aspirational: a seventeenth hand-rolled copy
 *      would silently opt itself out of the switch.
 *   3. THE INVARIANT, EXECUTED. A published event emits exactly one block
 *      carrying all five named properties, and each of those five TRACKS ITS
 *      INPUT: two rows differing in every one of them must produce two payloads
 *      differing in every one of them. A literal fails here and the failure
 *      names the offending event slug.
 *   4. NO UNPUBLISHED EVENT EMITS ANYTHING. Draft, scheduled and archived each
 *      produce no block, named by slug when one does.
 *   5. NO EVENT NODE OFF THE LEAF PAGE (SEO1 v2, FAULT THREE). Google: "Each
 *      event MUST have a unique URL (a leaf page) and markup on that URL. The
 *      event experience on Google only supports pages that focus on a single
 *      event." The organiser profile and the venue profile each shipped twelve
 *      nested Event nodes built from a city string, so the platform was
 *      publishing a lower-quality duplicate of its own leaf markup, which is the
 *      documented way to have the good copy discounted. Only
 *      src/lib/seo/event-schema.ts may name an Event type.
 *   6. NO ATTENDANCE-MODE PROPERTY ANYWHERE IN THE SHIPPING TREE (SEO1 v2,
 *      FAULT ONE). Google removed online events, and every property describing
 *      one, from its event documentation on 5 June 2025. Emitting it is dead
 *      code. The shipped payload carried it on every event.
 *   7. NO EMPTY CLAIM, AT ANY DEPTH (added 14 September 2026, after the push
 *      gate stopped with `Offer.name is an empty string`). The serialiser
 *      compacted its own TOP LEVEL and left every nested Offer, Place,
 *      PostalAddress and PerformingGroup outside the clean it reported. The
 *      clause runs the real serialiser over a row whose tier has no name and
 *      whose optional venue fields are blank, then WALKS the payload rather than
 *      naming properties, because the property that breaks is the one nobody
 *      thought to list. It also reads src/components/seo/json-ld.tsx, the one
 *      point every page type crosses, and fails if it serialises without
 *      pruning.
 *
 * WHY CLAUSE 6 BUILDS ITS OWN SEARCH STRING FROM TWO HALVES. The guard has to
 * name the token to look for it, and it scans scripts/, so a literal here would
 * make the guard fail on itself. The alternative is to exempt this file, and an
 * exemption is a hole; concatenating two halves leaves no exemption at all.
 *
 * WHY CLAUSE 6 DOES NOT READ docs/. `.vercelignore` strips docs/ from the
 * upload, and this guard is registered in run-guards.mjs, so it runs on
 * prebuild ON VERCEL. Four deployments have already been lost to a build-time
 * script reading a file that was never uploaded (`.vercelignore` names all
 * four in its own header). It scans src/, scripts/ and tests/: the tree that
 * ships and the tree that judges it. A historical record in docs/ describing
 * what the platform used to emit is not an emission.
 *
 * AND IT REFUSES TO BE VACUOUS. It fails if it judged fewer than the expected
 * number of properties, if it never saw both a describable and a non-describable
 * status, if either file sweep found nothing to read, or if the serialiser could
 * not be loaded at all. A guard that quietly checks nothing is worse than no
 * guard.
 *
 * WHAT IT STILL DOES NOT DO, stated plainly. It does not decide whether a
 * payload is VALID against Google's full published set. That is
 * tests/unit/seo/event-structured-data.test.ts, which runs the same real builder
 * through the validator in scripts/verify/event-structured-data-audit.mjs, so
 * the test and the deployed audit cannot drift into disagreeing. This guard
 * holds the wiring and the provenance; the test holds the content; the audit
 * holds the deployed truth.
 *
 * Proven red nine ways in scripts/verify/guard-failure-drills.mjs.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { WITHDRAWN_ONLINE_EVENT_TOKENS } from '../lib/withdrawn-online-event-properties.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[event-structured-data]'

const EVENT_PAGE = 'src/app/events/[slug]/page.tsx'
const COMPONENT = 'src/components/features/events/event-schema-jsonld.tsx'
export const SERIALISER = 'src/lib/seo/event-schema.ts'
export const ONE_EMITTER = 'src/components/seo/json-ld.tsx'
const PAYLOAD_TEST = 'tests/unit/seo/event-structured-data.test.ts'
const AUDIT = 'scripts/verify/event-structured-data-audit.mjs'
const RENDERER = 'src/components/seo/json-ld.tsx'
const STRUCTURED_DATA = 'src/lib/seo/structured-data.ts'

/** The five properties SEO1 names, which must all resolve from the row. */
export const TRACKED = ['name', 'startDate', 'location', 'organizer', 'offers']

/** Five properties across two rows: the least this guard may judge and still speak. */
export const MIN_JUDGED = TRACKED.length * 2

const failures = []
const scanned = []

function read(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    failures.push(`${rel} does not exist. The event structured-data path is broken.`)
    return null
  }
  scanned.push(rel)
  return readFileSync(abs, 'utf8')
}

/** Strips line and block comments so a mention in prose is not a match. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//'))
    .join('\n')
}

/* ── Clause 1: the wiring ─────────────────────────────────────────────────── */

const page = read(EVENT_PAGE)
if (page) {
  const src = code(page)
  if (!/<EventSchemaJsonLd\b/.test(src)) {
    failures.push(
      `${EVENT_PAGE} no longer renders <EventSchemaJsonLd>. Every published event ` +
        `page stops being eligible for Google's event experience, silently: the ` +
        `page keeps rendering and every test that does not read markup keeps passing.`,
    )
  }
  if (!/performers=\{lineup\}/.test(src)) {
    failures.push(
      `${EVENT_PAGE} no longer passes \`performers={lineup}\` to the emitter. The ` +
        `page already loads the lineup to render it visibly; not forwarding it left ` +
        `\`performer\` empty on 36 of 36 production event pages.`,
    )
  }
  if (!/ticketTiers=\{enrichedAllTiers\}/.test(src)) {
    failures.push(
      `${EVENT_PAGE} no longer passes \`ticketTiers={enrichedAllTiers}\` to the ` +
        `emitter. \`enrichedAllTiers\` carries display_price_cents, which is the ` +
        `price the page SHOWS; the raw rows carry only the stored price. Passing ` +
        `the raw rows tells Google one price and the buyer another on any event ` +
        `with a live demand-price move.`,
    )
  }
}

const component = read(COMPONENT)
if (component && !/export function EventSchemaJsonLd\b/.test(component)) {
  failures.push(`${COMPONENT} no longer exports EventSchemaJsonLd.`)
}

const serialiser = read(SERIALISER)
if (serialiser) {
  if (!/export function buildEventSchemaPayload\b/.test(serialiser)) {
    failures.push(
      `${SERIALISER} no longer exports buildEventSchemaPayload. The unit test and ` +
        `the deployed audit both judge that function; without it neither can.`,
    )
  }
  /*
   * The serialiser must stay reachable by a script. The alias loader strips
   * types but does NOT transpile, so a module that holds a React element cannot
   * be loaded by this guard at all and clause 3 would fall back to grepping.
   *
   * Two precise checks rather than a JSX heuristic: a heuristic on "<Capital"
   * matches `compact<T extends ...>` and fails on a file that is perfectly pure.
   * The path and the import are exact, and clause 3 executing the module is the
   * real proof either way.
   */
  if (!SERIALISER.endsWith('.ts') || SERIALISER.endsWith('.tsx')) {
    failures.push(
      `${SERIALISER} is not a plain .ts module. A .tsx file may hold JSX, which the ` +
        `alias loader cannot transpile, so this guard could no longer execute it.`,
    )
  }
  if (/from ['"]react['"]/.test(code(serialiser))) {
    failures.push(
      `${SERIALISER} imports React. It must stay a pure module the alias loader can ` +
        `execute; the rendering half belongs in ${COMPONENT}.`,
    )
  }
  // The empty-string regression that shipped once already.
  if (/venue_\w+\s*\?\?\s*''/.test(serialiser)) {
    failures.push(
      `${SERIALISER} writes an empty string for an absent venue field (\`?? ''\`). ` +
        `An empty string is a positive claim that the value is empty, not an ` +
        `absent optional. Use compact() and omit the key.`,
    )
  }
}

read(PAYLOAD_TEST)
read(AUDIT)

/* ── Clause 2: exactly one emitter, so the reversal flag reaches everything ── */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) walk(abs, out)
    else if (/\.(tsx|ts)$/.test(entry)) out.push(abs)
  }
  return out
}

/**
 * Like walk, but it also reads .mjs and .js, because clause 6 sweeps scripts/
 * and every verifier and guard in there is .mjs. node_modules and build output
 * are skipped: they are not this repository's claims about what it emits.
 */
function walkAll(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) walkAll(abs, out)
    else if (/\.(tsx|ts|mjs|js|cjs)$/.test(entry)) out.push(abs)
  }
  return out
}

const strays = []
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/')
  if (rel === ONE_EMITTER) continue
  const body = code(readFileSync(abs, 'utf8'))
  if (/type="application\/ld\+json"/.test(body)) strays.push(rel)
}
if (strays.length) {
  failures.push(
    `${strays.length} file(s) emit a raw application/ld+json script tag outside ` +
      `${ONE_EMITTER}: ${strays.join(', ')}. Every block must go through <JsonLd>, ` +
      `or SEO1's reversal condition ("one flag stops every block on every page ` +
      `type at once") is not true of those files.`,
  )
}

/* ── Clause 5: no Event node anywhere but the leaf event serialiser ────────── */

/**
 * `'@type': 'Event'` and every Schema.org Event sub-type, in either quote style.
 *
 * Matching the TYPE rather than the property means a page cannot slip a node
 * through by calling the property something other than `event`, which is
 * exactly how the two that shipped were spelled: `event: [...]` on the
 * Organization payload and on the Place payload.
 */
const EVENT_TYPE_NODE = /['"]@type['"]\s*:\s*['"](\w*Event)['"]/g

const eventNodes = []
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/')
  if (rel === SERIALISER) continue
  const body = code(readFileSync(abs, 'utf8'))
  for (const m of body.matchAll(EVENT_TYPE_NODE)) eventNodes.push(`${rel} (${m[1]})`)
}
if (eventNodes.length) {
  failures.push(
    `${eventNodes.length} Event node(s) are built outside ${SERIALISER}: ` +
      `${eventNodes.join(', ')}. Google: "Each event MUST have a unique URL (a ` +
      `leaf page) and markup on that URL. The event experience on Google only ` +
      `supports pages that focus on a single event." A page that LISTS events ` +
      `describes them as an ItemList of ListItems pointing at the leaf pages ` +
      `(src/lib/seo/event-item-list.ts), never as Event nodes of its own.`,
  )
}

/* ── Clause 6: the withdrawn attendance-mode property, nowhere in the tree ─── */

/**
 * Both withdrawn properties, from the one module that names them, which is also
 * the one place the two-halves construction is explained:
 * scripts/lib/withdrawn-online-event-properties.mjs.
 */
const WITHDRAWN = WITHDRAWN_ONLINE_EVENT_TOKENS

const withdrawnHits = []
let attendanceModeFilesRead = 0
for (const dir of ['src', 'scripts', 'tests']) {
  const root = join(ROOT, dir)
  if (!existsSync(root)) continue
  for (const abs of walkAll(root)) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/')
    attendanceModeFilesRead++
    const body = code(readFileSync(abs, 'utf8'))
    for (const w of WITHDRAWN) {
      if (body.includes(w.token)) withdrawnHits.push(`${rel} (${w.what})`)
    }
  }
}
if (withdrawnHits.length) {
  failures.push(
    `${withdrawnHits.length} file(s) still name the withdrawn attendance-mode ` +
      `property in CODE: ${withdrawnHits.join(', ')}. Google removed online ` +
      `events, and every property describing one, from its event documentation on ` +
      `5 June 2025, so emitting it is dead code (SEO1 v2, FAULT ONE). Prose in a ` +
      `comment is not a match; this is a line that runs.`,
  )
}
if (attendanceModeFilesRead === 0) {
  failures.push(
    `the attendance-mode sweep read 0 files, so clause 6 judged nothing. A guard ` +
      `that quietly checks nothing is worse than no guard.`,
  )
}

/* ── Clause 3 and 4: the invariant, executed against the real serialiser ───── */

/**
 * Two lane-C rows that differ in every tracked property, plus the three statuses
 * that must emit nothing. Fixtures rather than a database read on purpose: this
 * guard runs on every prebuild, including CI where the database is a placeholder,
 * and a guard that skips is not blocking. The REAL rows are exercised by the
 * driven proof, which is where a database belongs.
 */
const FIXTURES = {
  baseUrl: 'https://www.eventlinqs.com.au',
  rowA: {
    id: 'lane-c-a', slug: 'lane-c-guard-alpha', title: 'Lane C Guard Alpha',
    status: 'published', timezone: 'Australia/Melbourne',
    summary: 'The first of two rows that must not agree.', description: null,
    cover_image_url: 'https://cdn.example.com/alpha.avif',
    start_date: '2026-10-10T01:00:00+00:00', end_date: '2026-10-10T03:00:00+00:00',
    created_at: '2026-07-01T09:00:00+00:00', event_type: 'in_person',
    venue_name: 'Alpha Hall', venue_address: '1 Alpha St', venue_city: 'Melbourne',
    venue_state: 'VIC', venue_postal_code: '3000', venue_country: 'Australia',
    venue_latitude: null, venue_longitude: null,
    category: { slug: 'music', name: 'Music' },
  },
  rowB: {
    id: 'lane-c-b', slug: 'lane-c-guard-beta', title: 'Lane C Guard Beta',
    status: 'published', timezone: 'Australia/Perth',
    summary: 'The second of two rows that must not agree.', description: null,
    cover_image_url: 'https://cdn.example.com/beta.avif',
    start_date: '2027-03-02T04:00:00+00:00', end_date: '2027-03-02T07:00:00+00:00',
    created_at: '2027-01-05T09:00:00+00:00', event_type: 'in_person',
    venue_name: 'Beta Room', venue_address: '9 Beta Rd', venue_city: 'Perth',
    venue_state: 'WA', venue_postal_code: '6000', venue_country: 'Australia',
    venue_latitude: null, venue_longitude: null,
    category: { slug: 'comedy', name: 'Comedy' },
  },
  orgA: { name: 'Lane C Alpha Presents', slug: 'lane-c-alpha', description: null },
  orgB: { name: 'Lane C Beta Collective', slug: 'lane-c-beta', description: null },
  tiersA: [{ id: 'ta', name: 'General', price: 1800, currency: 'AUD' }],
  tiersB: [
    { id: 'tb1', name: 'Early', price: 4400, currency: 'AUD' },
    { id: 'tb2', name: 'Door', price: 6600, currency: 'AUD', display_price_cents: 7700 },
  ],
  unpublished: ['draft', 'scheduled', 'archived'],
  /*
   * CLAUSE 7's fixture: the exact shape that stopped the push gate on
   * 14 September 2026. A tier named '' is not hypothetical - one sits on TEST
   * today - and the optional venue fields are blanked alongside it because the
   * nested PostalAddress is the other node the old top-level compaction never
   * reached.
   */
  blankTiers: [{ id: 'tblank', name: '', price: 2500, currency: 'AUD' }],
}

/** Runs the REAL serialiser in a child process through the alias loader. */
function runSerialiser() {
  const script = `
    import { buildEventSchemaPayload } from '@/lib/seo/event-schema'
    const F = ${JSON.stringify(FIXTURES)}
    const build = (event, organisation, ticketTiers) =>
      buildEventSchemaPayload({ event, organisation, ticketTiers, state: 'upcoming', baseUrl: F.baseUrl })
    const out = {
      a: build(F.rowA, F.orgA, F.tiersA),
      b: build(F.rowB, F.orgB, F.tiersB),
      unpublished: F.unpublished.map(status => ({
        status,
        slug: F.rowA.slug + '-' + status,
        payload: build({ ...F.rowA, status, slug: F.rowA.slug + '-' + status }, F.orgA, F.tiersA),
      })),
      online: build(
        { ...F.rowA, slug: F.rowA.slug + '-online', event_type: 'virtual',
          venue_name: null, venue_address: null, venue_city: null,
          venue_state: null, venue_postal_code: null, venue_country: null },
        F.orgA,
        F.tiersA,
      ),
      hybrid: build(
        { ...F.rowA, slug: F.rowA.slug + '-hybrid', event_type: 'hybrid' },
        F.orgA,
        F.tiersA,
      ),
      blank: build(
        { ...F.rowA, slug: F.rowA.slug + '-blank',
          venue_name: '', venue_address: '   ', venue_postal_code: '' },
        { ...F.orgA, description: '' },
        F.blankTiers,
      ),
    }
    console.log(JSON.stringify(out))
  `
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      '--input-type=module',
      '-e',
      script,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(
      `could not execute ${SERIALISER} through the alias loader: ` +
        `${(r.stderr || r.stdout).trim().slice(0, 500)}`,
    )
  }
  const line = r.stdout.trim().split('\n').find(l => l.startsWith('{'))
  if (!line) throw new Error(`${SERIALISER} printed no payload: ${r.stdout.slice(0, 300)}`)
  return JSON.parse(line)
}

let judged = 0
let sawDescribable = false
let sawWithheld = false

try {
  const result = runSerialiser()

  for (const [key, slug] of [['a', FIXTURES.rowA.slug], ['b', FIXTURES.rowB.slug]]) {
    const payload = result[key]
    if (payload === null || payload === undefined) {
      failures.push(
        `${slug}: a PUBLISHED event emitted no structured data at all. Google's ` +
          `event experience takes its listings from this block; without it the ` +
          `page is ineligible.`,
      )
      continue
    }
    sawDescribable = true
    if (!String(payload['@type'] ?? '').endsWith('Event')) {
      failures.push(`${slug}: @type is "${payload['@type']}", which is not an Event type.`)
    }
    for (const prop of TRACKED) {
      judged++
      const value = payload[prop]
      const empty =
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0)
      if (empty) {
        failures.push(
          `${slug}: required property \`${prop}\` is missing or empty. SEO1 names ` +
            `name, startDate, location, organizer and offers as the five that must ` +
            `resolve from the database.`,
        )
      }
    }
  }

  /*
   * PROVENANCE, PROPERTY BY PROPERTY. Each emitted value is compared with one
   * computed HERE from the fixture row, so a literal is caught by name rather
   * than by inference.
   *
   * startDate is checked differently and deliberately: comparing it with a
   * second implementation of the zone conversion would just be two copies of the
   * same arithmetic agreeing with each other. Instead it is checked for the two
   * properties that matter and that a literal or a lost conversion both break:
   * it names the SAME INSTANT as the row, and it carries the EVENT's offset
   * rather than the server's.
   */
  for (const [key, row, org, tiers] of [
    ['a', FIXTURES.rowA, FIXTURES.orgA, FIXTURES.tiersA],
    ['b', FIXTURES.rowB, FIXTURES.orgB, FIXTURES.tiersB],
  ]) {
    const payload = result[key]
    if (!payload) continue
    const slug = row.slug

    if (payload.name !== row.title) {
      failures.push(`${slug}: \`name\` is "${payload.name}" and the row's title is "${row.title}".`)
    }
    const place = payload.location ?? {}
    if (place.name !== row.venue_name) {
      failures.push(`${slug}: \`location.name\` is "${place.name}" and the row's venue is "${row.venue_name}".`)
    }
    if (payload.organizer?.name !== org.name) {
      failures.push(`${slug}: \`organizer.name\` is "${payload.organizer?.name}" and the organisation is "${org.name}".`)
    }
    if (!String(payload.organizer?.url ?? '').endsWith(`/organisers/${org.slug}`)) {
      failures.push(`${slug}: \`organizer.url\` is "${payload.organizer?.url}" and does not resolve to /organisers/${org.slug}.`)
    }

    const emittedInstant = Date.parse(String(payload.startDate))
    if (emittedInstant !== Date.parse(row.start_date)) {
      failures.push(
        `${slug}: \`startDate\` is "${payload.startDate}", which is not the same ` +
          `instant as the row's start_date "${row.start_date}". The markup is ` +
          `advertising a different time from the one on sale.`,
      )
    }
    if (/(\+00:00|Z)$/.test(String(payload.startDate))) {
      failures.push(
        `${slug}: \`startDate\` is "${payload.startDate}", written in UTC on an ` +
          `event whose zone is ${row.timezone}. Google: "Specify the timezone by ` +
          `including the UTC or GMT time offset" and its example uses the event's ` +
          `own offset, which is also what the page shows a human.`,
      )
    }

    // ONE OFFER PER TIER, EACH AT THE PRICE THE PAGE SHOWS. This is the clause a
    // hard-coded price cannot survive, and it names the event it caught.
    const expectedPrices = tiers
      .map(t => (t.display_price_cents ?? t.price) / 100)
      .sort((x, y) => x - y)
      .map(n => n.toFixed(2))
    const emittedPrices = (Array.isArray(payload.offers) ? payload.offers : [payload.offers])
      .filter(Boolean)
      .map(o => String(o.price))
    judged++
    if (JSON.stringify(emittedPrices) !== JSON.stringify(expectedPrices)) {
      failures.push(
        `${slug}: offers emit [${emittedPrices.join(', ')}] and the tiers on the ` +
          `page are [${expectedPrices.join(', ')}]. Either a price is hard coded, ` +
          `or the tiers are not being emitted one Offer each ` +
          `("offers | Offer | A nested Offer, one for each ticket type").`,
      )
    }
  }

  // Every tracked property must DIFFER between two rows that differ in it. This
  // is the clause a hard-coded value cannot survive.
  if (result.a && result.b) {
    for (const prop of TRACKED) {
      const a = JSON.stringify(result.a[prop])
      const b = JSON.stringify(result.b[prop])
      if (a === b) {
        failures.push(
          `${FIXTURES.rowA.slug} and ${FIXTURES.rowB.slug} are two different events ` +
            `and both emitted the SAME \`${prop}\`: ${String(a).slice(0, 120)}. That ` +
            `property is not being read from the row. A literal in the serialiser ` +
            `looks exactly like this.`,
        )
      }
    }
  }

  for (const entry of result.unpublished ?? []) {
    judged++
    if (entry.payload !== null && entry.payload !== undefined) {
      failures.push(
        `${entry.slug}: an event with status "${entry.status}" emitted a structured ` +
          `data block. SEO1 step 4: an unpublished, draft or deleted event emits no ` +
          `markup at all.`,
      )
    } else {
      sawWithheld = true
    }
  }

  /*
   * THE ONLINE EVENT, AND THE HYBRID ONE BESIDE IT, because withholding is only
   * correct if it is aimed. A rule that withheld from both would be a bug that
   * looks like discipline: 8 of the platform's events are hybrid and every one
   * of them has a real venue.
   */
  judged++
  if (result.online !== null && result.online !== undefined) {
    failures.push(
      `${FIXTURES.rowA.slug}-online: a VIRTUAL event emitted a block. It has no ` +
        `Place, and Google withdrew the online-event properties that used to ` +
        `describe one on 5 June 2025, so the only way to emit it is to claim a ` +
        `physical address it does not have (SEO1 v2, FAULT ONE; step 8: "a wrong ` +
        `address is worse than no address").`,
    )
  }
  judged++
  if (!result.hybrid || !result.hybrid.location) {
    failures.push(
      `${FIXTURES.rowA.slug}-hybrid: a HYBRID event emitted no block, or no ` +
        `location. A hybrid event has a real venue and must still be described; ` +
        `withholding from it means the online rule is firing too wide.`,
    )
  }

  /*
   * CLAUSE 7. NO EMPTY CLAIM, AT ANY DEPTH.
   *
   * WHY IT EXISTS, and it is an incident rather than a precaution. The push gate
   * stopped on 14 September 2026 at its indexing step with one line:
   *
   *     [structured-data] FAIL: /events/lineup-loop-proof-night-3z7osn
   *                       Offer.name is an empty string
   *
   * The serialiser compacted, so the fault was not a missing clean. It was a
   * clean that ran over the TOP LEVEL of the payload only, and every nested
   * Offer, Place, PostalAddress and PerformingGroup lay outside it. That is the
   * shape worth defending against: a check that reports success over the part of
   * the document nobody was worried about.
   *
   * An empty string is not an absent property. It is a positive claim that the
   * value is nothing, and the platform's own validator refuses it for that
   * reason (scripts/verify/structured-data-validate.mjs: "no property is an
   * empty string, an empty array or null"). Google never asks for `Offer.name`,
   * so silence is the honest answer to a nameless tier.
   *
   * IT WALKS RATHER THAN NAMING PROPERTIES, deliberately. Listing the properties
   * that may not be blank would need extending every time the payload grows, and
   * the one that broke would be the one nobody thought to list.
   */
  judged++
  const blank = result.blank
  if (!blank) {
    failures.push(
      `${FIXTURES.rowA.slug}-blank: the blank-field fixture emitted no block at ` +
        `all, so clause 7 judged nothing. It is a published in-person event with ` +
        `a real address line and must still be described.`,
    )
  } else {
    const empties = []
    const walk = (node, path) => {
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`))
        return
      }
      if (node !== null && typeof node === 'object') {
        for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key)
        return
      }
      if (node === null) empties.push(`${path} is null`)
      else if (typeof node === 'string' && node.trim() === '') empties.push(`${path} is an empty string`)
    }
    walk(blank, '')
    if (empties.length) {
      failures.push(
        `${FIXTURES.rowA.slug}-blank: the payload carries ${empties.length} empty ` +
          `claim(s) a validator refuses, at ${empties.slice(0, 6).join(', ')}` +
          `${empties.length > 6 ? ', ...' : ''}. An empty string is a claim that ` +
          `the value is nothing; omission is the honest encoding. The walk is ` +
          `pruneJsonLd in ${STRUCTURED_DATA} and it must reach every depth.`,
      )
    }
    if (!blank.offers || blank.offers.length !== 1) {
      failures.push(
        `${FIXTURES.rowA.slug}-blank: a nameless tier must still produce its Offer ` +
          `(price, currency, availability, url); pruning a blank name must not ` +
          `delete the offer with it.`,
      )
    }
  }

  /*
   * AND THE SAME INVARIANT AT THE ONE PLACE EVERY PAGE TYPE PASSES THROUGH.
   * <JsonLd> is a .tsx holding a React element, so this guard cannot execute it
   * (see the header) and reads it instead. It is checked because the serialiser
   * above is not the only emitter: a serialiser written next month that never
   * compacts at all must still be unable to put an empty claim in front of
   * Google.
   */
  judged++
  const renderer = read(RENDERER)
  const rendererCode = code(renderer)
  if (!/JSON\.stringify\(\s*pruneJsonLd\(/.test(rendererCode)) {
    failures.push(
      `${RENDERER} serialises a payload without passing it through pruneJsonLd ` +
        `first, so any emitter that forgets to compact can publish an empty ` +
        `claim. This is the last point between a payload and the DOM and the ` +
        `only one every page type must cross.`,
    )
  }
  if (!/from '@\/lib\/seo\/structured-data'/.test(rendererCode) || !/pruneJsonLd/.test(rendererCode)) {
    failures.push(
      `${RENDERER} no longer imports pruneJsonLd from ${STRUCTURED_DATA}. Two ` +
        `copies of a cleaning rule is how two page types come to disagree about ` +
        `what clean means.`,
    )
  }
  scanned.push(`${RENDERER}: prunes every null and empty string before it serialises`)
} catch (error) {
  failures.push(`the serialiser could not be executed, so nothing below was judged: ${error.message}`)
}

/* ── The vacuity refusal ──────────────────────────────────────────────────── */

if (judged < MIN_JUDGED) {
  failures.push(
    `this guard judged ${judged} propert(ies), fewer than the ${MIN_JUDGED} it must. ` +
      `A guard that quietly checks nothing is worse than no guard.`,
  )
}
if (!sawDescribable) {
  failures.push('no published event produced a block, so the emitting half was never exercised.')
}
if (!sawWithheld) {
  failures.push('no unpublished event withheld a block, so the withholding half was never exercised.')
}

console.log(`${TAG} what this guard scanned:`)
for (const s of scanned) console.log(`    - ${s}`)
console.log(
  `${TAG} executed ${SERIALISER} over 2 published, ${FIXTURES.unpublished.length} ` +
    `unpublished, 1 online and 1 hybrid lane-C fixture; judged ${judged} ` +
    `propert(ies); tracked: ${TRACKED.join(', ')}.`,
)
console.log(
  `${TAG} swept ${attendanceModeFilesRead} file(s) across src, scripts and tests ` +
    `for the withdrawn attendance-mode property, and every src file for an Event ` +
    `node built outside ${SERIALISER}.`,
)
console.log(
  `${TAG} NOT checked here (by design): whether a payload is valid against ` +
    `Google's full published set. That is ${PAYLOAD_TEST}, which runs the same ` +
    `real builder through the validator in ${AUDIT}. Also NOT checked: docs/, ` +
    `which .vercelignore strips from the upload, so reading it here would fail ` +
    `the build on Vercel and nowhere else.`,
)

if (failures.length) {
  console.error(`\n${TAG} FAIL`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

declareWork('event-structured-data', {
  did: {
    'wiring point checked': scanned.length,
    'property judged': judged,
    'file swept': attendanceModeFilesRead,
  },
  found: { break: 0, 'stray emitter': 0, 'off-leaf Event node': 0, 'withdrawn property': 0 },
})
console.log(`${TAG} PASS - the event structured-data path is wired end to end and reads the row.`)
