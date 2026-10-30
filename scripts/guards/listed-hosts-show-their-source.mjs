/**
 * GUARD: AN EVENTLINQS LISTING SHOWS ITS SOURCE, AND NEVER WHO HOLDS IT
 * (WI2, docs/walk-in/WI2-PLAN.md sections 8a and 10).
 * ---------------------------------------------------------------------------
 * WHAT WI2 PROMISED, quoted. WI2-ITEM.md, "Last checked": "A night not confirmed
 * for 21 days is hidden from the guide until checked again." Ruling A of
 * 23 October 2026: "the listings organisation is Lawal's and is never shown ...
 * every artefact of an EventLinqs listing names its host".
 *
 * WHY A GUARD. Both promises are one line of code each, in places no test of a
 * listing would think to look: a discovery read that composes its own predicate
 * instead of the one helper, or a new surface that prints `organisation.name`
 * from a shared row. Either drops the promise everywhere at once and every page
 * still renders. Found reading the code for Part 2 on 24 October 2026: every
 * discovery card printed the organisation's name from the shared row, the
 * walk-in page offered to follow it, and its organiser page was in the sitemap.
 *
 * THE RULES IT HOLDS NOW (Part 2). Rules 1 and 2 of section 10 (the unclaimed
 * venue page's images and its "Hosted by ... Listed by EventLinqs" line) arrive
 * with Part 3's venue pages, in this file.
 *
 *   F1  the one visibility helper composes the freshness group, beside the
 *       listing window: listing_fresh_until is null or not yet passed
 *   F2  the city guide's read (fetchFreeWeekEvents) composes that helper
 *   H1  the shared row shaping names a listing's host (shownOrganiser)
 *   H2  the walk-in page names the host through shownOrganiser, offers Follow
 *       only where shown.followable, and prints no organisation name of its own
 *   H3  the organiser page refuses the listings organisation
 *   H4  the sitemap's organiser catalogue leaves it out
 *   H5  the event's structured data asks shownOrganiser and carries an
 *       organiser url only where there is an organiser page, or where we hold
 *       the organiser's own website (the project manager's 23:56 (3) of
 *       30 October 2026); the expression may span lines
 *   H6  the checked file's reading refuses a host that is a note ("Organiser
 *       not named ..."), because H1 to H5 show that field as who runs the night
 *
 * WHAT IT CANNOT SEE. It reads source, function by function. It cannot see a
 * surface that reads events through a client of its own without the helper;
 * scripts/guards/one-visibility-source.mjs holds that half. The behaviour is
 * pinned by tests/unit/listings/*.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[listed-hosts-show-their-source]'
const ROOT = process.cwd()
const failures = []
let filesRead = 0
let rulesJudged = 0

function read(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    failures.push(`${rel} does not exist, and this guard judges it: a file renamed away is scanned for nothing and reported as a pass`)
    return ''
  }
  filesRead += 1
  return readFileSync(abs, 'utf8')
}

/** The body of a named function, from its declaration to the next top-level declaration. */
function bodyOf(src, rel, marker) {
  const start = src.indexOf(marker)
  if (start === -1) {
    failures.push(`${rel}: "${marker}" is gone, so its rule cannot be judged`)
    return ''
  }
  const next = src.slice(start + marker.length).search(/\n(?:export )?(?:async )?function |\nconst [A-Za-z_]+ = /)
  return next === -1 ? src.slice(start) : src.slice(start, start + marker.length + next)
}

function rule(id, ok, message) {
  rulesJudged += 1
  if (!ok) failures.push(`${id} ${message}`)
}

const VISIBILITY = 'src/lib/events/public-visibility.ts'
const FETCHERS = 'src/lib/events/fetchers.ts'
const WALK_IN_PAGE = 'src/components/events/walk-in/walk-in-event-page.tsx'
const ORGANISER_PAGE = 'src/app/organisers/[handle]/page.tsx'
const CATALOGUE = 'src/lib/seo/sitemap-catalogue.ts'
const EVENT_SCHEMA = 'src/lib/seo/event-schema.ts'

const visibility = read(VISIBILITY)
const apply = bodyOf(visibility, VISIBILITY, 'export function applyPublicEventVisibility')
const fresh = bodyOf(visibility, VISIBILITY, 'export function listingFreshOrPredicate')
rule('F1', /\.or\(listingFreshOrPredicate\(now\)\)/.test(apply) && /\.or\(listingWindowOrPredicate\(now\)\)/.test(apply),
  `${VISIBILITY}: applyPublicEventVisibility no longer composes the freshness group beside the listing window, so a night unchecked for 21 days stays on every surface`)
rule('F1', fresh.includes('listing_fresh_until.is.null') && fresh.includes('listing_fresh_until.gte.'),
  `${VISIBILITY}: listingFreshOrPredicate no longer admits exactly an event with no freshness date and a listing still within its date`)

const fetchers = read(FETCHERS)
const week = bodyOf(fetchers, FETCHERS, 'export async function fetchFreeWeekEvents')
rule('F2', /applyPublicEventVisibility\(/.test(week),
  `${FETCHERS}: fetchFreeWeekEvents does not compose applyPublicEventVisibility, so the city guide could show an unchecked night`)
const shape = bodyOf(fetchers, FETCHERS, 'function toPublicEventRow')
rule('H1', /shownOrganiser\(/.test(shape) && /isEventLinqsListing\(/.test(shape),
  `${FETCHERS}: toPublicEventRow no longer names a listing's host, so every discovery card would print the listings organisation`)

const walkIn = read(WALK_IN_PAGE)
rule('H2', /shownOrganiser\(event, org\)/.test(walkIn),
  `${WALK_IN_PAGE}: the walk-in page no longer asks shownOrganiser who to name`)
rule('H2', /shown\.followable\s*&&\s*\(/.test(walkIn),
  `${WALK_IN_PAGE}: the organiser Follow button no longer waits for shown.followable, so a listing would offer to follow the listings organisation`)
rule('H2', !/\{org\.name\}|\/organisers\/\$\{org\.slug\}/.test(walkIn),
  `${WALK_IN_PAGE}: the walk-in page prints org.name or links /organisers/\${org.slug} itself, around shownOrganiser`)

const organiserPage = read(ORGANISER_PAGE)
const fetchOrganiser = bodyOf(organiserPage, ORGANISER_PAGE, 'const fetchOrganiser = cache(')
rule('H3', /if \(isListingsOrganisation\(slug\)\) return null/.test(fetchOrganiser),
  `${ORGANISER_PAGE}: fetchOrganiser no longer refuses the listings organisation, so its page would answer`)

const catalogue = read(CATALOGUE)
rule('H4', /if \(isListingsOrganisation\(slug\)\) continue/.test(catalogue),
  `${CATALOGUE}: the organiser catalogue no longer leaves the listings organisation out of the sitemap`)

const schema = read(EVENT_SCHEMA)
// The builder asks shownOrganiser itself and links only the slug it gives (car 2's read back on production,
// 29 October 2026: the event page handed the raw organisation, and two listings linked /organisers/eventlinqs-listings).
rule('H5', /shownOrganiser\(event, organisation\)/.test(schema) && /\.\.\.\(shown\.slug\s*\?\s*\{ url: /.test(schema),
  `${EVENT_SCHEMA}: the organizer node carries a url whether or not there is an organiser page, or names the listings organisation (it must ask shownOrganiser)`)

const ROWS = 'src/lib/listings/listing-rows.ts'
const rows = read(ROWS)
rule('H6', /const HOST_IS_A_NOTE = \/\\bnot named\\b/.test(rows) && /if \(HOST_IS_A_NOTE\.test\(v\('host'\)\)\) \{\s*refused\.push\(/.test(rows),
  `${ROWS}: the checked file's reading no longer refuses a host that is a note, so "Organiser not named on listing" would be shown as who runs the night`)

declareWork('listed-hosts-show-their-source', {
  did: { 'source file read': filesRead, 'rule judged': rulesJudged },
  found: { 'broken promise': failures.length },
})

if (failures.length > 0) {
  console.error(`${TAG} FAIL: an EventLinqs listing could stay listed unchecked, or show who holds it:`)
  for (const f of failures) console.error(`${TAG}   ${f}`)
  process.exit(1)
}

console.log(`${TAG} PASS - ${rulesJudged} rule(s) across ${filesRead} file(s): an unchecked night leaves every surface, and a listing names its host and never the listings organisation.`)
