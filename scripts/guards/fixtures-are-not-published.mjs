/**
 * A DRIVE'S FIXTURE IS NEVER PUBLISHED TO THE SITEMAP.
 *
 * WHY THIS EXISTS, from the incident rather than from a principle. On
 * 14 September 2026 lane A's pre-push gate was refused at step 13 of 16 by two
 * lines that had nothing to do with lane A's work:
 *
 *     [indexing-drive] FAIL: RULE 2: /organisers/lane-b-pl1-org-202609141153
 *                            is in the sitemap and answered 404
 *     [indexing-drive] FAIL: RULE 2: /venues/lane-b-pl1-warehouse
 *                            is in the sitemap and answered 404
 *     [gate] BLOCKED at indexing (exit 1) after 92s. Nothing was pushed.
 *
 * Both belonged to scripts/verify/pl1-loops-drive.mjs, which created an
 * organisation with `status: 'active'` and an event with `visibility: 'public'`,
 * drove them for a few minutes and deleted them. Those two literals are exactly
 * what src/app/sitemap.ts selects on, three lanes share ONE TEST database, and
 * the sitemap holds its snapshot for 300 seconds. So for the life of that
 * fixture the platform advertised an organiser profile, a venue page and an
 * event page that were about to stop existing, and another lane's gate read the
 * snapshot after they had gone.
 *
 * THE GATE WAS RIGHT, and the same shape has already cost production: the header
 * of src/app/sitemap.ts records 48 advertised URLs answering 404 to Googlebot on
 * 25 August 2026 after a direct database purge.
 *
 * WHY A GUARD RATHER THAN SIX EDITS. The edits were made; the guard is for the
 * seventh drive. A fixture is written once and lives for years, the hazard is
 * invisible in the drive's own output (it passes, every time, and blocks
 * somebody else), and the cost lands on a different lane on a different day.
 * That is precisely the shape nobody catches by reading.
 *
 * THE RULE, and it is narrow on purpose. In any `scripts/verify/*-drive.mjs`,
 * and in any shared fixture builder under `scripts/verify/lib/`:
 *
 *   a write to `organisations` may not set `status: 'active'`
 *   a write to `events`        may not set `visibility: 'public'`
 *
 * Neither costs a drive anything. An event page renders at every visibility
 * except `private` (src/app/events/[slug]/page.tsx returns the full page and
 * hard-blocks only private), and a pending organisation is read publicly through
 * the RLS policy "Active organisations are publicly browsable", so it is absent
 * rather than broken: the event page's organiser block simply does not render,
 * which is why a pending fixture leaves no dead link either.
 *
 * THE PREMISE IS CHECKED, NOT ASSUMED. This rule is only true while the sitemap
 * still selects on those two literals, and a guard whose premise has quietly
 * moved is worse than no guard: it keeps passing while the thing it protects
 * stops being protected. So before judging a single drive this reads
 * src/app/sitemap.ts and src/lib/events/public-visibility.ts and fails if the
 * predicates it depends on are no longer there.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not read the database and it does
 * not run anything: that is the runtime half, and it lives in
 * scripts/verify/lib/sitemap-footprint.mjs, which each drive calls on its own
 * rows. Static source and live rows are two different claims and this file only
 * makes the first one.
 *
 * AND THE GAP, NAMED RATHER THAN LEFT TO BE DISCOVERED. Under scripts/verify
 * there are also *-proof.mjs, *-drill.mjs, *-gate.mjs and *-fixture.mjs files,
 * and EIGHTEEN of them carry exactly this shape today: connect-paths-proof,
 * refund-dashboard-e2e, webhook-ordering-drill, quiet-hours-proof and the rest.
 * They are not judged here. Judging them means writing eighteen baseline
 * entries, and each entry is a claim about WHY that fixture must be public,
 * which is a claim their own lanes are able to make and this one is not. An
 * allowlist of eighteen reasons somebody else guessed is worth less than a
 * stated gap. It is handed to lane A and lane C as a line beginning BORDER in
 * REVIEW-QUEUE-B.md, with the list.
 *
 * THE REVIEWED BASELINE is printed on every run and reports entries that match
 * nothing, so it cannot rot into an unexamined allowlist. Three drives are on it
 * today and all three belong to other lanes: each genuinely needs a publicly
 * visible fixture because the thing it proves IS public visibility.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments, lineAt } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const VERIFY = join(ROOT, 'scripts', 'verify')
const TAG = '[fixtures-are-not-published]'

/**
 * THE TWO WRITES THE SITEMAP PUBLISHES, AND WHY THEY ARE FOUND DIFFERENTLY.
 *
 * `visibility: 'public'` is read ANYWHERE in a drive, not only inside a
 * `.from('events').insert(...)` chain, and that is not laziness. The first
 * version of this guard looked only inside the chain and reported
 * community-threshold-drive as clean: that drive builds its rows as a plain
 * array of literals at the top of the file and inserts the variable further
 * down, so the chain never sees a literal at all. A false negative in a guard is
 * worse than no guard, and `visibility` is an `events` column and nothing else's
 * in this tree, so the wider read costs no precision.
 *
 * `status: 'active'` CANNOT be read that way, because `status` is a column on
 * many tables and `reservations` legitimately writes exactly that string. It is
 * therefore tied to a `.from('organisations')` chain. The blind spot that
 * follows - an organisations row built as a variable - is not left silent: a
 * write whose argument is not a literal is reported as unjudgeable rather than
 * passed.
 */
const FORBIDDEN_ANYWHERE = [
  {
    table: 'events',
    field: 'visibility',
    value: 'public',
    publishes: '/events/<slug> AND /venues/<handle> derived from venue_name',
    instead: "'unlisted', which PUBLIC_EVENT_MATCH excludes while the event page still renders in full",
  },
]

const FORBIDDEN_IN_CHAIN = [
  {
    table: 'organisations',
    field: 'status',
    value: 'active',
    publishes: '/organisers/<slug>',
    instead: "'pending', which the sitemap's `.eq('status','active')` excludes and which the RLS policy hides from anonymous readers",
  },
]

/** The tables whose writes must be judgeable, so a variable cannot hide one. */
const MUST_BE_LITERAL = ['organisations']

/**
 * Drives excused ONE write each, with the reason. A drive is never excused
 * wholesale: an entry names the single write it cannot avoid.
 *
 * Every entry here is a drive whose SUBJECT is public visibility, so a fixture
 * that is not public would prove nothing. They still carry the hazard, and that
 * is recorded rather than hidden: see REVIEW-QUEUE-B.md, line beginning BORDER.
 */
/*
 * EXPORTED, so the unit test can derive the excused set from THIS list rather
 * than keeping a second copy of it. A second copy is what broke on 17 September
 * 2026: two entries were added here for lane C's SEO drives and the test still
 * named two drives by hand, so the guard passed and the test failed about the
 * same tree. One list, read twice.
 */
export const BASELINE = [
  {
    drive: 'community-threshold-drive.mjs',
    write: "events.visibility='public'",
    why: 'it proves the discovery threshold, which counts publicly visible events; an unlisted fixture is invisible to the thing under test',
  },
  {
    drive: 'seo1-structured-data-drive.mjs',
    write: "events.visibility='public'",
    why: 'it proves Schema.org Event markup on a page whose entire purpose is being indexable; an unlisted fixture is noindex by definition',
  },
  {
    drive: 'seo1-structured-data-drive.mjs',
    write: "organisations.status='active'",
    why: 'the same fixture needs an organiser profile that resolves, because the structured data references it',
  },
  /*
   * LB-GIGWHOLE'S ORGANISER, AND WHY 'active' IS NOT A PUBLICATION HERE.
   *
   * Posting a gig is refused for any organisation that is not active
   * (requireActiveOrganisation in src/app/actions/gigs.ts), so `pending` would
   * make the surface under test unreachable rather than merely invisible.
   *
   * It is not a sitemap hazard, and that is CHECKED rather than asserted.
   * src/lib/seo/sitemap-catalogue.ts filters active organisations through
   * isOrganiserProfileIndexable(eventCount, hasBiography, threshold), which is
   * `hasBiography || isDiscoveryIndexable(eventCount, threshold)`. The fixture
   * sets no `description` and owns no event, so both halves are false and the
   * row never reaches the sitemap. The drive would have to start writing a
   * description, or publishing an event, for that to stop being true.
   */
  {
    drive: 'lb-gigwhole-drive.mjs',
    write: "organisations.status='active'",
    why: 'posting a gig is refused for an organisation that is not active, and the fixture carries no description and no event, so the substance rule in the sitemap catalogue excludes it',
  },
  /*
   * LB-SHOWCASEWHOLE'S PAST SHOW, AND WHY 'unlisted' WOULD DEFEAT THE CHECK.
   *
   * The drive needs a CREDIT on a public performer profile, and a credit is a
   * show that has already happened. fetchArtistCredits filters through
   * `isPubliclyDiscoverable`, which since the child-safety ruling of 9 August
   * 2026 is an ALLOW-LIST of exactly `public`. So an unlisted fixture would not
   * appear as a credit at all, and the drive would be asserting the absence of
   * the thing it exists to prove. The guard's usual advice, "use unlisted, the
   * page still renders", is sound everywhere it is offered and is the one case
   * it does not fit.
   *
   * IT IS NOT A SITEMAP HAZARD, AND THAT IS CHECKED TWICE RATHER THAN ASSERTED.
   * Statically: both sitemap catalogues select through `PUBLIC_EVENT_MATCH`
   * (`src/lib/seo/sitemap-catalogue.ts`), which is
   * `{ status: 'published', visibility: 'public' }`, and this row is written
   * `status: 'completed'`, so neither the event entry nor the venue entry
   * derived from `venue_name` can match it. This guard reads text and cannot
   * see the sibling literal in the same insert, which is why the entry is here
   * rather than the guard being widened to accept a second literal it would
   * then have to keep believing after a later UPDATE.
   * At RUNTIME: the drive calls `sitemapFootprint` on that slug and its venue
   * name and fails if the footprint is anything but empty, which is the half
   * this guard's own header says belongs in the drive.
   */
  {
    drive: 'lb-showcasewhole-drive.mjs',
    write: "events.visibility='public'",
    why: "a credit is a PAST show and the credits allow-list admits only 'public', so unlisted would delete the thing under test; the row is status 'completed', which PUBLIC_EVENT_MATCH excludes from both sitemap catalogues, and the drive proves the empty footprint at runtime",
  },
  /*
   * LANE A'S SHARED BUILDER, and the one entry here that is NOT comfortable.
   *
   * scripts/verify/lib/refund-proof-fixture.mjs builds a SELLABLE organisation
   * and event: the sale gate reads `org.status === 'active'` and the refund
   * proofs and both FO1 drives need a real purchase to complete, so `pending`
   * would make the thing under test impossible rather than merely invisible.
   *
   * What is uncomfortable is that the same file exports `purgeFixtures`, which
   * deletes exactly those published rows, so the create-then-delete shape that
   * refused lane A's push on 14 September 2026 lives here too. It is baselined
   * rather than changed because the file is lane A's territory and money code;
   * REVIEW-QUEUE-B.md carries a line beginning BORDER that says so and hands
   * them the finding.
   */
  {
    drive: 'lib/refund-proof-fixture.mjs',
    write: "events.visibility='public'",
    why: "the refund proofs and FO1 need a SELLABLE event and a buyer reaches it through the public paths; lane A's file, handed to them as a BORDER line",
  },
  {
    drive: 'lib/refund-proof-fixture.mjs',
    write: "organisations.status='active'",
    why: "the sale gate refuses an organisation that is not active, so a pending one cannot take the payment the proof is about; lane A's file, handed to them as a BORDER line",
  },
  /*
   * ADDED 16 September 2026 when lane C's SEO work arrived in this tree. THREE
   * of its drives write a public event; two of them are on this list and the
   * third is not, and the difference was established by reading the product
   * rather than by reading the drive's own header.
   *
   *   discovery-flip-drive.mjs  EXCUSED. Its whole subject is whether a city
   *     page flips to indexable and APPEARS IN THE SITEMAP when a real event is
   *     published in it. An unlisted fixture is excluded by PUBLIC_EVENT_MATCH
   *     and would therefore be invisible to the thing under test, which is the
   *     same reason community-threshold-drive.mjs is excused above.
   *
   *   seo5-states-drive.mjs  EXCUSED, and NOT because it renders event pages.
   *     The event page renders `unlisted` in full (only `private` is screened
   *     out, src/app/events/[slug]/page.tsx), so the three state proofs alone
   *     would not need it. It also opens /venues/<handle>, and that route
   *     resolves through resolveVenueProfile, which reads events through
   *     PUBLIC_EVENT_MATCH (src/lib/venues/resolver.ts). An unlisted fixture
   *     gives that page nothing to resolve, so the access-section proof on the
   *     venue page could not run at all.
   *
   *   all-in-pricing-drive.mjs  NOT EXCUSED, because the same reading says it
   *     does not need it: it opens /events/<slug> and nothing else, and that
   *     page renders unlisted. It is changed rather than baselined, and the
   *     change is recorded as a cross-lane edit in REVIEW-QUEUE-B.md.
   */
  {
    drive: 'discovery-flip-drive.mjs',
    write: "events.visibility='public'",
    why: 'it proves a city page flips to indexable and appears in the sitemap when a real event is published in it; PUBLIC_EVENT_MATCH excludes an unlisted fixture, so it would be invisible to the thing under test',
  },
  /*
   * ADDED 19 September 2026, lane B, LB-ISODATE. The drive proves two defects on
   * the matcher's event picker, and that picker reads through
   * applyPublicEventVisibility, which is `.eq('visibility', 'public')`. An
   * `unlisted` fixture is excluded by the very predicate under test, so it would
   * prove nothing: the same reason community-threshold-drive.mjs is excused
   * above.
   *
   * ONLY THE EVENT WRITE IS EXCUSED. The organisation is created `pending`,
   * because nothing the drive opens needs an organiser profile to resolve, and
   * the drive's teardown asks the database whether its rows are gone rather than
   * trusting its own deletes.
   */
  {
    drive: 'lb-isodate-drive.mjs',
    write: "events.visibility='public'",
    why: 'the matcher picker it proves reads through applyPublicEventVisibility, so an unlisted fixture is excluded by the predicate under test',
  },
  {
    drive: 'seo5-states-drive.mjs',
    write: "events.visibility='public'",
    why: 'it opens /venues/<handle>, and resolveVenueProfile derives that page through PUBLIC_EVENT_MATCH, so an unlisted fixture leaves that page with nothing to resolve',
  },
]

/**
 * Every `.from('<table>')` write in a source file, as
 * `{ table, method, literal, offset }`.
 *
 * The window for one `.from(...)` ends at the next `.from(...)`, which is what
 * keeps a SELECT on one table from being credited with an INSERT on the next.
 */
export function writesIn(src) {
  const code = stripComments(src)
  const out = []
  const froms = [...code.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)]
  for (let i = 0; i < froms.length; i += 1) {
    const m = froms[i]
    const start = m.index + m[0].length
    const end = i + 1 < froms.length ? froms[i + 1].index : code.length
    const window = code.slice(start, end)
    const call = window.match(/\.(insert|upsert|update)\(/)
    if (!call) continue
    const openParen = start + call.index + call[0].length - 1
    /*
     * A LITERAL OR NOTHING. `.insert(rows)` is a write this guard cannot judge,
     * and it reports `literal: null` so the caller can say so out loud rather
     * than treat an unreadable write as a clean one.
     */
    const firstChar = code.slice(openParen + 1).match(/\S/)
    const isLiteral = firstChar && (firstChar[0] === '{' || firstChar[0] === '[')
    const literal = isLiteral ? balanced(code, openParen) : null
    out.push({ table: m[1], method: call[1], literal, offset: openParen })
  }
  return out
}

/** The text between a `(` at `open` and its matching `)`, or null. */
function balanced(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    const c = code[i]
    if (c === '(' || c === '{' || c === '[') depth += 1
    else if (c === ')' || c === '}' || c === ']') {
      depth -= 1
      if (depth === 0) return code.slice(open + 1, i)
    }
  }
  return null
}

/** Does this object literal set `field` to the string `value`? */
export function setsField(literal, field, value) {
  const re = new RegExp('\\b' + field + "\\s*:\\s*'" + value + "'")
  return re.test(literal)
}

/** What one drive does wrong. Exported so the drill and the unit test can call it. */
export function judgeDrive(name, src) {
  const code = stripComments(src)
  const problems = []

  for (const rule of FORBIDDEN_ANYWHERE) {
    const re = new RegExp('\\b' + rule.field + "\\s*:\\s*'" + rule.value + "'", 'g')
    for (const m of code.matchAll(re)) {
      problems.push({
        drive: name,
        write: `${rule.table}.${rule.field}='${rule.value}'`,
        line: lineAt(src, m.index),
        message:
          `${name}:${lineAt(src, m.index)} writes ${rule.field}: '${rule.value}', ` +
          `which publishes ${rule.publishes} into a sitemap three lanes read and one lane deletes. Use ${rule.instead}.`,
      })
    }
  }

  for (const w of writesIn(code)) {
    if (w.literal === null) {
      if (!MUST_BE_LITERAL.includes(w.table)) continue
      problems.push({
        drive: name,
        write: `${w.table}.<unjudgeable>`,
        line: lineAt(src, w.offset),
        message:
          `${name}:${lineAt(src, w.offset)} ${w.method}s ${w.table} from a variable, so this guard cannot see ` +
          'whether the row it writes is published. Inline the object literal at the call, which is what every ' +
          'other fixture in this tree does, or the rule silently stops applying to this drive.',
      })
      continue
    }
    for (const rule of FORBIDDEN_IN_CHAIN) {
      if (w.table !== rule.table) continue
      if (!setsField(w.literal, rule.field, rule.value)) continue
      problems.push({
        drive: name,
        write: `${rule.table}.${rule.field}='${rule.value}'`,
        line: lineAt(src, w.offset),
        message:
          `${name}:${lineAt(src, w.offset)} ${w.method}s ${rule.table} with ${rule.field}: '${rule.value}', ` +
          `which publishes ${rule.publishes} into a sitemap three lanes read and one lane deletes. Use ${rule.instead}.`,
      })
    }
  }
  return problems
}

/**
 * THE PREMISE. The rule above is worth nothing if the sitemap has stopped
 * selecting on these. Each entry names the file, what must still be true of it,
 * and why the rule depends on it.
 */
/*
 * RE-DERIVED 16 September 2026, WHICH IS WHAT THE FAILURE MESSAGE ASKS FOR.
 *
 * The first two entries named `src/app/sitemap.ts`, and on the tree that merged
 * lane B's work with lane C's SEO2 they stopped matching: the three catalogue
 * reads moved out of the route into `src/lib/seo/sitemap-catalogue.ts`, which
 * the route now composes. The predicates did not change value; they changed
 * address.
 *
 * That is exactly the case this list exists for, and the guard behaved: it went
 * red saying THIS GUARD'S PREMISE HAS MOVED rather than quietly judging drives
 * against a rule that was no longer true. The fix is to re-aim it at where the
 * predicate lives now, never to delete the check.
 *
 * The route is ALSO pinned, on the composition rather than on the predicate, so
 * a catalogue that still selects correctly but is no longer read by the sitemap
 * cannot leave this guard confidently enforcing a rule about nothing.
 */
/*
 * EXPORTED for the same reason as BASELINE: the test asserts every premise
 * still matches, so re-aiming one here re-aims the test with it, and a premise
 * that moves can never leave a passing test pinned to the old address.
 */
export const PREMISES = [
  {
    file: 'src/lib/seo/sitemap-catalogue.ts',
    needle: ".eq('status', 'active')",
    why: "the organiser catalogue's predicate; it is the reason an active fixture organisation is published at /organisers/<slug>",
  },
  {
    file: 'src/lib/seo/sitemap-catalogue.ts',
    needle: '.match(PUBLIC_EVENT_MATCH)',
    why: 'the event and venue catalogues both compose it; it is the reason a public fixture event publishes two URLs',
  },
  {
    file: 'src/app/sitemap.ts',
    needle: "from '@/lib/seo/sitemap-catalogue'",
    why: 'the route still READS those three catalogues; a sitemap that stopped calling them would make the two predicates above true and irrelevant',
  },
  {
    file: 'src/lib/events/public-visibility.ts',
    needle: 'visibility: PUBLIC_VISIBILITY',
    why: 'PUBLIC_EVENT_MATCH still carries the visibility half, so `unlisted` is still excluded by it',
  },
  {
    file: 'scripts/verify/lib/sitemap-footprint.mjs',
    needle: "SITEMAP_EVENT_MATCH = { status: 'published', visibility: 'public' }",
    why: 'the runtime half asks the same question this guard assumes; a drifted copy would report an empty footprint for a published fixture',
  },
]

/**
 * WHAT THIS GUARD READS, and why it is not just `*-drive.mjs`.
 *
 * The first version read the drives only, and reported the tree clean while five
 * published lane B fixture events sat on TEST. Four of them were built by
 * scripts/verify/lib/refund-proof-fixture.mjs, a SHARED builder two FO1 drives
 * call, so the literals were never in a drive file at all. A rule that a caller
 * can escape by moving the object one file away is not a rule.
 *
 * So: every `-drive.mjs` under scripts/verify, plus every `.mjs` under
 * scripts/verify/lib that writes a fixture row. The path is reported relative to
 * scripts/verify so a message names something a reader can open.
 */
/*
 * THE ONE FILE THIS RULE CANNOT READ AS A FIXTURE, and it is excluded by name
 * rather than excused on the baseline, because it is not an exception to the
 * rule: it is the rule. scripts/verify/lib/sitemap-footprint.mjs DECLARES the
 * sitemap's predicate as `SITEMAP_EVENT_MATCH = { status: 'published',
 * visibility: 'public' }`, which is a description of what the sitemap selects
 * and not a row anybody writes. It is not left unchecked either: the premise
 * list below asserts that constant still matches the product's.
 */
/*
 * FORWARD SLASHES, ALWAYS. `join` gives a backslash on Windows and a forward
 * slash on the Linux runner, so a baseline key written one way silently matched
 * nothing on the other and a guard would have behaved differently in CI from
 * the machine it was written on. The separator is fixed here rather than in the
 * baseline.
 */
const rel = (...parts) => parts.join('/')
const THE_RULES_OWN_RUNTIME_HALF = rel('lib', 'sitemap-footprint.mjs')

function subjects() {
  const out = []
  if (existsSync(VERIFY)) {
    for (const f of readdirSync(VERIFY)) if (f.endsWith('-drive.mjs')) out.push(f)
    const lib = join(VERIFY, 'lib')
    if (existsSync(lib)) for (const f of readdirSync(lib)) if (f.endsWith('.mjs')) out.push(rel('lib', f))
  }
  return out.filter((f) => f !== THE_RULES_OWN_RUNTIME_HALF).sort()
}
function main() {
  const premiseFailures = []
  for (const p of PREMISES) {
    const abs = join(ROOT, p.file)
    const text = existsSync(abs) ? readFileSync(abs, 'utf8') : null
    if (text === null) {
      premiseFailures.push(`${p.file} is gone, and this guard's rule rests on it: ${p.why}`)
      continue
    }
    if (!text.includes(p.needle)) {
      premiseFailures.push(
        `${p.file} no longer contains \`${p.needle}\`. ${p.why}. ` +
          'Re-derive the rule in this guard from what the sitemap now does, rather than deleting this check.',
      )
    }
  }

  const files = subjects()
  const problems = []
  let writesJudged = 0
  const matched = new Set()

  for (const f of files) {
    const src = readFileSync(join(VERIFY, ...f.split('/')), 'utf8')
    writesJudged += writesIn(src).length
    for (const problem of judgeDrive(f, src)) {
      const excused = BASELINE.find((b) => b.drive === f && b.write === problem.write)
      if (excused) {
        matched.add(f + ':' + problem.write)
        continue
      }
      problems.push(problem.message)
    }
  }

  console.log(TAG + ' reviewed baseline (' + BASELINE.length + '), printed every run on purpose:')
  for (const b of BASELINE) {
    const stale = matched.has(b.drive + ':' + b.write) ? '' : '  STALE: it matches nothing now, delete it'
    console.log(TAG + '   ' + b.drive + ' excused ' + b.write + ': ' + b.why + stale)
  }

  declareWork('fixtures-are-not-published', {
    did: { 'drive read': files.length, 'fixture write judged': writesJudged, 'premise checked': PREMISES.length },
    // Both labels are shaped for scripts/lib/work-report.mjs, which pluralises the
    // HEAD NOUN and finds the head at the first participle or preposition. With
    // neither present it takes the LAST word, so 'fixture the sitemap would publish'
    // printed "0 fixture the sitemap would publishes".
    found: { 'fixture that the sitemap would publish': problems.length, 'moved premise': premiseFailures.length },
  })

  if (premiseFailures.length > 0) {
    console.error(TAG + " THIS GUARD'S PREMISE HAS MOVED. It judges drives against what the sitemap publishes,")
    console.error(TAG + ' and what the sitemap publishes is no longer what it was when the rule was written.')
    for (const f of premiseFailures) console.error(TAG + '   ' + f)
  }
  if (problems.length > 0) {
    console.error(TAG + ' a drive fixture is published to the sitemap, on a database three lanes share:')
    for (const p of problems) console.error(TAG + '   ' + p)
  }
  if (premiseFailures.length + problems.length > 0) process.exit(1)

  console.log(`${TAG} PASS: ${files.length} drive(s), ${writesJudged} fixture write(s), none published to the sitemap`)
}

if (process.argv[1] && process.argv[1].endsWith('fixtures-are-not-published.mjs')) main()
