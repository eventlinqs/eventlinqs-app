/**
 * A READ THAT FAILED MAY NOT BE WRITTEN DOWN AS SOMETHING A PERSON DECIDED.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on TEST on 21 September 2026.
 *
 * `src/lib/consent/resolver.ts` is the one door every message on this platform
 * goes through, and it fails CLOSED: a ledger it cannot read refuses the send,
 * because an unreadable consent record is not evidence of consent. That is the
 * right answer to the question it was built for, "may this message go out",
 * where being wrong costs one marketing email.
 *
 * TWO CALLERS WERE ASKING A DIFFERENT QUESTION: "does this address already hold
 * a live consent?" They ask it so that a returning buyer who leaves the
 * marketing checkbox alone is not recorded as having declined, because under the
 * Spam Act a withdrawal is a deliberate act and an untouched box is not one.
 * Both refusals were the same `permitted: false`, so a blinked read sent an
 * untouched box down the decline branch, and the ledger's latest-event rule
 * turned it into a withdrawal nobody performed.
 *
 *     before   permitted true,  "granted on 14 Sept 2026 under wording v1"
 *     after    permitted false, "the latest consent event is declined"
 *
 * on a real ledger, on a person who touched nothing, with the read failing on
 * cue: 4 requests, one call and three retries. AND IT CANNOT BE UNDONE. The
 * ledger is append only and this platform's own rule is that a consent row is
 * evidence and is never altered or removed.
 *
 * THE SAME SHAPE, WEARING A DIFFERENT FACE, IN THE SAME DIRECTORY. The city a
 * consent is scoped to was resolved by two reads that discarded their error and
 * had no retry, so one dropped packet filed somebody who chose Geelong as having
 * chosen nowhere. The digest is city scoped, so that consent is on no send list
 * at all, for ever, on a row that still reads "granted": they said yes, they
 * never hear anything, and nobody finds out.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A GUARD OF ITS OWN AND NOT A CLAUSE IN THE SIBLING.
 *
 * `a-failed-read-is-not-a-fact-about-a-person` judges whether a read BINDS its
 * error. Every read named here now binds it or goes through a door, so that
 * guard is green on all of this and always would have been on half of it: the
 * resolver's reads have gone through `readOrThrow` since 21 September and the
 * defect was one level up, in what a CALLER did with the answer. A verdict can
 * be produced by perfectly careful reads and still be the wrong kind of fact to
 * write down. That is a different property and it needs its own gate.
 *
 * IT ALSO GUARDS A DELETION, which is the thing most likely to be quietly
 * undone. `src/lib/consent/digest-city.ts` used to re-read `public.cities` to
 * validate the slug `public.events` had just handed it. That read was redundant
 * because `events.city_primary` is a foreign key into exactly that table, so it
 * could only ever return the row it was given or FAIL, and every null it
 * produced was an outage dressed as a validation. Deleting it is part of the
 * fix, and a deletion is only safe for as long as the thing that made it
 * redundant is true, so clause 6 asserts the foreign key is still declared.
 *
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied. Clause 4 is judged per
 * FILE: it asks whether a file that both resolves a send and writes a consent
 * event mentions `ledgerWasRead` anywhere in it. A file could therefore consult
 * the field in one function and forget it in a second one added later, and this
 * would not notice. The behaviour itself is pinned by
 * tests/unit/consent/an-outage-is-not-a-withdrawal.test.ts, which drives both
 * writers with the ledger failing and asserts nothing is written. This clause is
 * the cheap, blunt half that catches a THIRD writer appearing, which is how two
 * became two in the first place.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[an-outage-is-not-a-withdrawal]'

const DECIDE = 'src/lib/consent/decide.ts'
const RESOLVER = 'src/lib/consent/resolver.ts'
const CITY_DOOR = 'src/lib/consent/digest-city.ts'
const CITY_TAXONOMY = 'src/lib/cities/data.ts'
const CITY_MIGRATION = 'supabase/migrations/20260507000001_city_taxonomy.sql'

/** The field that carries the distinction. Named once. */
const FIELD = 'ledgerWasRead'

const failures = []

function read(rel) {
  const abs = resolve(ROOT, rel)
  if (!existsSync(abs)) {
    failures.push(`${rel} does not exist, and this guard judges it. A file renamed away is scanned for nothing and reported as a pass.`)
    return null
  }
  return readFileSync(abs, 'utf8')
}

/**
 * Every `return { ... }` literal in a source file, with its braces matched
 * rather than guessed.
 *
 * A REGEX CANNOT DO THIS and the attempt is worth naming, because a verdict
 * literal in this tree contains nested objects and a non-greedy `\{[^}]*\}`
 * stops at the first inner brace, which silently judges a fragment. The scan
 * counts depth.
 */
export function returnedObjectLiterals(src) {
  const out = []
  const marker = /return\s*\{/g
  let m
  while ((m = marker.exec(src)) !== null) {
    const open = src.indexOf('{', m.index)
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end === -1) continue
    out.push(src.slice(open, end + 1))
    marker.lastIndex = end
  }
  return out
}

/**
 * THE MATCHER IS ASKED A QUESTION IT KNOWS THE ANSWER TO BEFORE IT IS TRUSTED
 * WITH THE TREE.
 *
 * A blind matcher has no natural symptom: it reports "every verdict answers the
 * question" about a file where none of them do. It is not hypothetical on this
 * project. On 18 September 2026 a guard shipped with `\s` inside a template
 * literal, where it is not a recognised escape, so the pattern compiled to
 * something that matched nothing and printed a confident PASS over the very file
 * it was written for. So the probe carries the shapes this guard has to see,
 * including the nested one that defeats the obvious regex, and the guard REFUSES
 * rather than reporting on a tree it cannot read.
 */
export const CALIBRATION_PROBE = `
  function a() {
    return { permitted: false, reason: 'x', decidingEventId: null, ${FIELD}: false }
  }
  function b() {
    return { ...decideSend({ tenantSlug, purpose }, [], []), ${FIELD}: true }
  }
  function c() {
    return { permitted: [], refused: normalised.map((email) => ({ email, reason: 'y' })) }
  }
`

export function calibrationFault() {
  const found = returnedObjectLiterals(CALIBRATION_PROBE)
  if (found.length !== 3) return `it saw ${found.length} of the 3 returned literals in its own probe`
  const nested = found[1]
  if (!nested.includes('decideSend(') || !nested.includes(`${FIELD}: true`)) {
    return 'it cannot read a literal that spreads a nested call, which is the shape the resolver returns'
  }
  if (!found[2].includes('refused')) {
    return 'it stopped at the first inner brace of the recipient-list literal, so it judges fragments'
  }
  const judged = found.filter(isAVerdictLiteral)
  if (judged.length !== 2) {
    return `it judged ${judged.length} of the 2 verdict literals in its probe, and must not judge the recipient list`
  }
  return null
}

/**
 * A returned literal that IS a send verdict, by the two spellings the resolver
 * actually uses: one that names the deciding event, and one that spreads the
 * pure decision. Deliberately narrow, so `filterPermittedRecipients`, whose
 * returned shape also binds `permitted`, is not dragged in and made to carry a
 * field that means nothing for a list of addresses.
 */
export function isAVerdictLiteral(literal) {
  return literal.includes('decidingEventId') || literal.includes('decideSend(')
}

/** The slugs `public.cities` is seeded with, read out of the one migration that seeds it. */
export function seededCitySlugs(sql) {
  const start = sql.indexOf('insert into public.cities')
  if (start === -1) return []
  const end = sql.indexOf(';', start)
  const block = sql.slice(start, end === -1 ? sql.length : end)
  return [...block.matchAll(/^\s*\('([a-z0-9-]+)'/gm)].map((m) => m[1])
}

/** The slugs the taxonomy in code accepts, read off the object `isCitySlug` is built from. */
export function taxonomyCitySlugs(ts) {
  const start = ts.indexOf('const CITIES: Record<CitySlug, CityContent> = {')
  if (start === -1) return []
  const end = ts.indexOf('const SUBURBS', start)
  const block = ts.slice(start, end === -1 ? ts.length : end)
  return [...block.matchAll(/^ {2}'?([a-z0-9-]+)'?: \{$/gm)].map((m) => m[1])
}

const blind = calibrationFault()
if (blind) {
  console.error(`${TAG} REFUSING TO REPORT: ${blind}.`)
  console.error(`${TAG} A guard that cannot see its own probe cannot see the tree, and its PASS would be a statement about itself.`)
  process.exit(1)
}

// ---------------------------------------------------------------- clause 1
const decide = read(DECIDE)
let verdictsJudged = 0
if (decide && !new RegExp(`^\\s*${FIELD}: boolean$`, 'm').test(decide)) {
  failures.push(
    `${DECIDE} does not declare \`${FIELD}: boolean\` on the send verdict. Without it nothing can tell a refusal ` +
      `decided from the ledger's rows from a refusal that happened because the ledger could not be read, and the ` +
      `second one gets written into an append-only ledger as a withdrawal the person never made.`,
  )
}

// ------------------------------------------------------- clauses 2 and 3
const resolver = read(RESOLVER)
if (resolver) {
  for (const literal of returnedObjectLiterals(resolver)) {
    if (!isAVerdictLiteral(literal)) continue
    verdictsJudged += 1
    if (!literal.includes(`${FIELD}:`)) {
      failures.push(
        `${RESOLVER} returns a send verdict that does not answer \`${FIELD}\`: ` +
          `${literal.replace(/\s+/g, ' ').slice(0, 120)}. Every verdict says whether it is evidence about a person.`,
      )
    }
  }
  if (verdictsJudged === 0) {
    failures.push(`${RESOLVER} returned no send verdict this guard could find, which means it is judging nothing.`)
  }
  /*
   * VERDICT LITERALS ONLY, and the exclusion is real rather than convenient.
   * `filterPermittedRecipients` refuses with the same sentence, in a shape that
   * is a LIST OF ADDRESSES rather than a verdict about one person, and there is
   * nothing for `ledgerWasRead` to mean on it. The first version of this clause
   * did flag it, which is how the distinction got written down. What keeps that
   * exclusion honest is clause 4: a file that calls EITHER resolver entry point
   * and writes a consent event has to consult the field.
   */
  const unreadable = returnedObjectLiterals(resolver).filter(
    (l) => isAVerdictLiteral(l) && l.includes('the consent ledger could not be read'),
  )
  if (unreadable.length === 0) {
    failures.push(
      `${RESOLVER} no longer returns the "the consent ledger could not be read" verdict, which is the one case ` +
        `this whole guard is about. If the sentence changed, change it here too rather than dropping the clause.`,
    )
  }
  for (const literal of unreadable) {
    if (!literal.includes(`${FIELD}: false`)) {
      failures.push(
        `${RESOLVER} answers an unreadable ledger without \`${FIELD}: false\`. That refusal is an outage and not ` +
          `a fact about anybody, and a caller that cannot tell will write it down as one.`,
      )
    }
  }
}

// ---------------------------------------------------------------- clause 4
const WRITES = ['recordConsentEvent(', 'recordSuppressionEvent(']
/*
 * BOTH ENTRY POINTS. `filterPermittedRecipients` answers the same question for a
 * whole list and fails closed identically, and its refusal carries no
 * `ledgerWasRead` because a list of addresses is not a verdict about a person.
 * That is exactly why it belongs here: a file that turns EITHER answer into a
 * written consent event has to be able to tell an outage from a decision.
 */
const RESOLVES = ['resolveSend(', 'filterPermittedRecipients(']
/**
 * HOW MANY FILES DID BOTH, ON THE DAY THIS WAS WRITTEN. Two:
 * `src/lib/consent/checkout-answer.ts` and `src/lib/consent/record.ts`.
 *
 * THE NUMBER IS HERE SO THE CLAUSE CANNOT GO BLIND QUIETLY. A clause that finds
 * its own subjects by pattern has a failure mode with no symptom: the pattern
 * stops matching, the clause judges nothing, and the guard prints PASS. Holding
 * the count means a drop has to be EXPLAINED, by lowering this number on purpose
 * rather than by nobody noticing. A RISE needs nothing: a third writer is judged
 * on arrival, which is the whole point.
 */
const WRITERS_WHEN_WRITTEN = 2
let writersJudged = 0
for (const file of sourceFiles(ROOT, { subdir: 'src' }).filter((f) => /\.tsx?$/.test(f))) {
  const src = readFileSync(resolve(ROOT, file), 'utf8')
  if (!RESOLVES.some((r) => src.includes(r))) continue
  if (!WRITES.some((w) => src.includes(w))) continue
  if (file.split('\\').join('/') === 'src/lib/consent/ledger.ts') continue // where the writers are defined
  writersJudged += 1
  if (!src.includes(FIELD)) {
    failures.push(
      `${file.split('\\').join('/')} turns a send verdict into a written consent event and never consults ` +
        `\`${FIELD}\`. A refusal the resolver gave because it could not READ the ledger would be recorded as ` +
        `something the person decided, in a ledger that is append only and is never corrected.`,
    )
  }
}
if (writersJudged < WRITERS_WHEN_WRITTEN) {
  failures.push(
    `clause 4 found ${writersJudged} file(s) that both resolve a send and write a consent event, and there were ` +
      `${WRITERS_WHEN_WRITTEN} when it was written. Either a writer moved or was renamed, in which case this ` +
      `clause is no longer looking at it, or one genuinely stopped writing consent events, in which case lower ` +
      `WRITERS_WHEN_WRITTEN on purpose. A clause that silently judges fewer subjects than it used to is how a ` +
      `guard goes blind without anybody noticing.`,
  )
}

// ---------------------------------------------------------------- clause 5
const cityDoor = read(CITY_DOOR)
let cityReads = 0
if (cityDoor) {
  const tables = [...cityDoor.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1])
  cityReads = tables.length
  const expected = ['cities', 'events']
  if (tables.join(',') !== expected.join(',')) {
    failures.push(
      `${CITY_DOOR} reads [${tables.join(', ')}] and must read exactly [${expected.join(', ')}], in that order. ` +
        `A third read here is the re-validation of \`events.city_primary\` against \`cities\` that was deleted on ` +
        `21 September 2026: the foreign key already guarantees that row, so the read could only return what it was ` +
        `handed or FAIL, and every null it produced was an outage wearing the costume of a validation.`,
    )
  }
  /*
   * EVERY read, not merely one of them. `includes('readOrThrow(')` was the first
   * spelling of this clause and it passed a file where one read went through the
   * door and the other was a bare destructure, which is half the defect intact.
   * Counting is what makes the drill that restores a single bare read fire.
   */
  const throughTheDoor = [...cityDoor.matchAll(/readOrThrow\(/g)].length
  if (throughTheDoor !== cityReads) {
    failures.push(
      `${CITY_DOOR} makes ${cityReads} read(s) and only ${throughTheDoor} of them go through \`readOrThrow\`. ` +
        `Without the retry a read gives up on the first dropped packet, which is how a buyer who chose Geelong ` +
        `was filed as having chosen nowhere, on a consent row that still reads "granted".`,
    )
  }
  if (!cityDoor.includes('isCitySlug(')) {
    failures.push(
      `${CITY_DOOR} no longer falls back to the city taxonomy in code when the cities table cannot be read. ` +
        `That fallback is the only thing standing between a dropped packet and a consent scoped to nowhere.`,
    )
  }
}

// ---------------------------------------------------------------- clause 6
const migration = read(CITY_MIGRATION)
if (migration && !/city_primary text references public\.cities\(slug\)/.test(migration)) {
  failures.push(
    `${CITY_MIGRATION} no longer declares \`city_primary text references public.cities(slug)\`. ` +
      `${CITY_DOOR} deleted its re-validation of that column BECAUSE of this foreign key. If the key is gone the ` +
      `deletion is no longer safe, and the read has to come back rather than the guard being relaxed.`,
  )
}

// ---------------------------------------------------------------- clause 7
const taxonomy = read(CITY_TAXONOMY)
let slugsCompared = 0
if (migration && taxonomy) {
  const seeded = new Set(seededCitySlugs(migration))
  const inCode = taxonomyCitySlugs(taxonomy)
  slugsCompared = inCode.length
  if (seeded.size === 0 || inCode.length === 0) {
    failures.push(
      `clause 7 read ${seeded.size} seeded slug(s) and ${inCode.length} slug(s) in code, and cannot compare ` +
        `nothing. One of the two shapes has changed and the matcher must be corrected rather than left blind.`,
    )
  }
  const missing = inCode.filter((slug) => !seeded.has(slug))
  if (missing.length > 0) {
    failures.push(
      `the city taxonomy in code accepts ${missing.map((s) => `'${s}'`).join(', ')}, which ${CITY_MIGRATION} does ` +
        `not seed into public.cities. ${CITY_DOOR} uses that taxonomy as its fallback when the table cannot be ` +
        `read, and a consent row's city is a foreign key into that table, so a slug the code accepts and the ` +
        `table does not have would fail the write and LOSE the consent, which is worse than the defect the ` +
        `fallback exists to fix.`,
    )
  }
}

// ---------------------------------------------------------------- clause 8
/*
 * THE ONE SURFACE THAT SHOWS THE VERDICT TO THE PERSON IT IS ABOUT.
 *
 * /marketing/preferences/[token] built its sentence inline from `permitted`
 * alone, so an unreadable ledger printed, to the person whose consent it is:
 * "Right now, EventLinqs sends you no marketing: the consent ledger could not be
 * read, so the message is refused." The leading clause asserts their state on a
 * read that failed and the trailing clause is the internal reason pasted after a
 * colon. That page exists so somebody can SEE AND CHANGE their marketing state,
 * and a person who reads that they are sent no marketing stops pressing: the
 * same harm this platform already ruled on when a live unsubscribe link was
 * called spent because a socket dropped.
 *
 * The sentence is pure and lives in one place now, so it is testable and so a
 * second surface cannot grow a second wording.
 */
const SENTENCES = 'src/lib/consent/sentences.ts'
const PREFERENCES = 'src/app/marketing/preferences/[token]/page.tsx'
const sentences = read(SENTENCES)
const preferences = read(PREFERENCES)
let statefulSurfacesJudged = 0
if (sentences) {
  statefulSurfacesJudged += 1
  if (!/export function marketingStateSentence/.test(sentences)) {
    failures.push(
      `${SENTENCES} no longer exports \`marketingStateSentence\`. The sentence a person reads about their own ` +
        `marketing state is pure and lives here so that it can be tested and so a second surface cannot grow a ` +
        `second wording for it.`,
    )
  } else if (!/if \(!verdict\.ledgerWasRead\)/.test(sentences)) {
    failures.push(
      `${SENTENCES} builds the marketing-state sentence without branching on \`ledgerWasRead\`. The resolver ` +
        `fails closed, so without that branch an outage prints "EventLinqs sends you no marketing" to somebody ` +
        `whose consent may be perfectly live, on the one page they use to check it.`,
    )
  }
}
if (preferences) {
  statefulSurfacesJudged += 1
  if (!preferences.includes('marketingStateSentence(verdict)')) {
    failures.push(
      `${PREFERENCES} does not render the state through \`marketingStateSentence(verdict)\`. It built that ` +
        `sentence inline until 21 September 2026, which is how it came to assert a person's marketing state ` +
        `from a read that had failed.`,
    )
  }
  if (/sends you no marketing/.test(preferences)) {
    failures.push(
      `${PREFERENCES} spells the marketing-state sentence inline again. One wording, in ${SENTENCES}, or the ` +
        `branch that keeps an outage out of it can be lost in a copy nobody tests.`,
    )
  }
}

declareWork('an-outage-is-not-a-withdrawal', {
  did: {
    'send verdict judged': verdictsJudged,
    'consent writer judged': writersJudged,
    'read in the city door judged': cityReads,
    'city slug compared against the migration': slugsCompared,
    'surface that shows a verdict to a person judged': statefulSurfacesJudged,
  },
  found: {
    'outage that could be written down as a decision': failures.length,
  },
})

if (failures.length > 0) {
  console.error(`${TAG} an outage could be recorded as something a person decided:`)
  for (const failure of failures) console.error(`${TAG}   ${failure}`)
  process.exit(1)
}

console.log(
  `${TAG} PASS: ${verdictsJudged} send verdict(s) answer whether the ledger was read, ${writersJudged} consent ` +
    `writer(s) consult it, the city door makes ${cityReads} read(s) through the door with the taxonomy behind it, ` +
    `all ${slugsCompared} slug(s) it can fall back to are seeded into public.cities, and ` +
    `${statefulSurfacesJudged} surface(s) that show a verdict to the person it is about never assert a state ` +
    `the ledger did not answer.`,
)
