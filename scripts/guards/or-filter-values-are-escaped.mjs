/**
 * GUARD: A SEARCH TERM DROPPED INTO A POSTGREST `or(...)` IS ESCAPED.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured against TEST on 19 September 2026.
 *
 * Inside `or(...)` the characters `,` `.` `(` `)` are GRAMMAR, not data, so an
 * unescaped term carrying one is parsed as more filter clauses:
 *
 *     .or(`title.ilike.%Session, Geelong%,slug.ilike.%Session, Geelong%`)
 *     PGRST100  failed to parse logic tree
 *
 * The request answers 500 and the screen that asked shows nothing, with no way
 * for the person typing to know that a comma is the reason. Four of the first
 * 320 event titles on TEST carry one, and every one of them is of the shape
 * "Something Night, Geelong", which is the natural title for this platform.
 *
 * THE ESCAPE ALREADY EXISTED, privately, in src/lib/events/fetchers.ts, with the
 * whole of the reasoning written above it. By the date above the same decision
 * had been made THREE more times in THREE different ways and missed in six
 * reads. A rule kept by habit is kept until somebody copy-pastes, which is the
 * lesson scripts/guards/one-db-read-door.mjs was written for and this is the
 * same shape in product code.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT JUDGES, and it is narrow on purpose.
 *
 * A `.or(...)` whose argument is a TEMPLATE LITERAL containing BOTH an
 * interpolation and `.ilike.` is a free-text pattern built by interpolation,
 * which is the exact shape every instance of this defect took. A filter that
 * interpolates an id, a timestamp or a boolean is not in scope: `user_id.eq.
 * ${user.id}` and `effective_until.gt.${nowIso}` carry no user text and no
 * grammar character, and a guard that fired on them is a guard somebody
 * switches off.
 *
 * WHAT IT CANNOT SEE, said plainly. A filter assembled into a variable and then
 * handed to `.or(that)` is invisible to it. src/lib/events/fetchers.ts does
 * exactly that and is CORRECT, because it composes through escapeOrValue; the
 * unit tests beside the door are what hold that half.
 *
 * ---------------------------------------------------------------------------
 * THE DEBT REGISTER, AND WHY IT IS NOT AN EXEMPTION.
 *
 * Six call sites match and are NOT lane B's files to change. They are printed
 * on every run, with what is actually wrong with each, because a debt nobody
 * can see is a debt nobody pays. Five of them are BROKEN TODAY in the same way
 * the fee-override picker was; one is correct and merely duplicated. The whole
 * list, with line numbers, is in C:/dev/REVIEW-QUEUE-B.md for their owners.
 *
 * An entry that stops matching is reported as STALE, so the register cannot rot
 * into a list nobody has re-read.
 *
 * READ AS CODE, NOT AS TEXT. Every file is passed through stripComments first,
 * because the post-mortem above quotes the very filter it bans.
 *
 * NO SHEBANG (a leading #! breaks Vite when a test imports this module) and no
 * git call (the build host has no git).
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[or-filter]'
const ROOT = process.cwd()

const DOOR = 'src/lib/supabase/or-filter.ts'
const DOOR_EXPORTS = ['escapeOrValue', 'ilikeAnyOf']

/** Regex LITERALS. A pattern built in a template literal is how a guard here shipped blind. */
const OR_CALL = /\.or\s*\(/
const ESCAPED = /escapeOrValue\s*\(|ilikeAnyOf\s*\(/
/**
 * THE SECOND SAFE MECHANISM, and it is a weaker check than the first.
 *
 * src/lib/events/search-query.ts sanitises at the SOURCE instead of escaping at
 * the call: `sanitiseToken` replaces every grammar character, so a token that
 * reaches a filter cannot carry one. Two reads in src/lib/events/fetchers.ts are
 * safe that way and are correct, so they must not be failed and must not be
 * baselined as debt either.
 *
 * It is accepted at FILE level rather than at the call, because the sanitising
 * happens where the token is made and the filter is built from an array of
 * already-clean tokens. WHAT THAT CANNOT PROVE, said plainly: a file that
 * sanitises one query could still interpolate a raw term into another. The
 * counts below report the two tiers separately so a reader can see how many
 * passed on the weaker one, and it is two.
 */
const SANITISES_AT_SOURCE = /from\s*'\.\/search-query'|from\s*'@\/lib\/events\/search-query'/

/**
 * The six that match and belong to somebody else. `why` says what is actually
 * true of each, because "broken" and "correct but duplicated" are different
 * debts and lumping them together would make the register useless.
 */
export const REGISTER = [
  {
    where: 'src/lib/admin/events.ts',
    why: 'BROKEN: admin event search, title and slug, unescaped. Same shape as the measured PGRST100',
  },
  {
    where: 'src/lib/admin/orders.ts',
    why: 'BROKEN: admin order search, order number and guest email, unescaped',
  },
  {
    where: 'src/lib/admin/organisers.ts',
    why: 'BROKEN: admin organiser search, name, slug and email, unescaped',
  },
  {
    where: 'src/lib/admin/users.ts',
    why: 'BROKEN: admin user search, email and both name columns, unescaped. A name written "Smith, John" finds nobody',
  },
  {
    where: 'src/lib/admin/search.ts',
    why: 'BROKEN: the global admin search, both of its reads, unescaped',
  },
  {
    where: 'src/lib/events/search-scopes.ts',
    why: 'CORRECT BUT DUPLICATED: it escapes by hand, with a comment pointing at fetchers.ts. Nothing is wrong with the behaviour; it is a second copy of one decision',
  },
]

const failures = []
const notes = []
let filesSwept = 0
let orCallsJudged = 0
let acceptedAtTheCall = 0
let acceptedBySanitiser = 0
const matched = new Set()

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function lineOf(source, index) {
  return source.slice(0, index).split(String.fromCharCode(10)).length
}

/** The argument list of a call, by matching parentheses from the opening one. */
function callRegion(source, openParenIndex) {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return source.slice(openParenIndex, i + 1)
    }
  }
  return source.slice(openParenIndex)
}

/* --------------------------------------------------------------------------
 * Clause 1: the door exists and exports both halves.
 * ------------------------------------------------------------------------ */
const doorPath = join(ROOT, DOOR)
if (!existsSync(doorPath)) {
  failures.push(`${DOOR} is missing. It is the one place that knows an or() value is not plain text.`)
} else {
  const door = stripComments(readFileSync(doorPath, 'utf8'))
  const absent = DOOR_EXPORTS.filter(name => !door.includes(`export function ${name}`))
  if (absent.length > 0) {
    failures.push(`${DOOR} no longer exports ${absent.join(' and ')}.`)
  } else {
    notes.push(`${DOOR} exports ${DOOR_EXPORTS.join(' and ')}`)
  }
}

/* --------------------------------------------------------------------------
 * Clause 2: no free-text or() filter is built by raw interpolation.
 * ------------------------------------------------------------------------ */
const files = walk(join(ROOT, 'src'), [])

for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  filesSwept += 1
  if (rel === DOOR) continue
  const code = stripComments(readFileSync(abs, 'utf8'))

  let m
  const scan = new RegExp(OR_CALL.source, 'g')
  while ((m = scan.exec(code)) !== null) {
    const open = code.indexOf('(', m.index)
    const region = callRegion(code, open)
    /*
     * WHAT COUNTS AS A FREE-TEXT FILTER, and the second half is what makes the
     * counters mean anything.
     *
     * A template literal that interpolates something AND names ilike is the
     * shape every instance of this defect took. A filter interpolating an id,
     * an instant or a flag is not in scope.
     *
     * A call that NAMES THE DOOR is judged too, even though it is not a
     * template literal, so a tree where every site was fixed still reports the
     * work rather than reporting zero. The work report refuses a step whose
     * counter came back zero, and it is right to: a guard that judged nothing
     * prints the same OK as one that judged everything.
     */
    const looksFreeText = region.includes('${') && region.includes('.ilike.')
    const namesTheDoor = ESCAPED.test(region)
    if (!looksFreeText && !namesTheDoor) continue
    orCallsJudged += 1
    if (namesTheDoor) {
      acceptedAtTheCall += 1
      continue
    }
    if (SANITISES_AT_SOURCE.test(code)) {
      acceptedBySanitiser += 1
      continue
    }

    const known = REGISTER.find(entry => entry.where === rel)
    if (known) {
      matched.add(rel)
      continue
    }
    failures.push(
      `${rel}:${lineOf(code, m.index)} builds an or() ilike pattern by interpolation, unescaped. ` +
        `A comma in the term answers PGRST100 and the screen shows nothing. Use ilikeAnyOf or ` +
        `escapeOrValue from ${DOOR}.`,
    )
  }
}

if (filesSwept === 0) {
  failures.push(
    'the sweep matched no files at all, which is a broken sweep rather than a clean tree.',
  )
} else {
  notes.push(
    `${filesSwept} file(s) swept, ${orCallsJudged} free-text or() filter(s) judged: ` +
      `${acceptedAtTheCall} escaped at the call, ${acceptedBySanitiser} sanitised at the source`,
  )
}

/*
 * THE MATCHERS PROVE THEMSELVES, on every run, for the reason recorded in
 * scripts/guards/consent-dates-are-zoned.mjs: a guard in this tree shipped with
 * a pattern that compiled to nonsense and reported PASS over the thing it
 * banned, and only the red half of a drill found it.
 */
const PROBES = [
  { pattern: SANITISES_AT_SOURCE, sample: "import { tokenise } from './search-query'", shouldMatch: true },
  { pattern: SANITISES_AT_SOURCE, sample: "import { tokenise } from './something-else'", shouldMatch: false },
  { pattern: OR_CALL, sample: 'q.or(`a.ilike.${t}`)', shouldMatch: true },
  { pattern: OR_CALL, sample: 'q.order(`a`)', shouldMatch: false },
  { pattern: ESCAPED, sample: "ilikeAnyOf(['title'], q)", shouldMatch: true },
  { pattern: ESCAPED, sample: 'somethingElse(q)', shouldMatch: false },
]
for (const probe of PROBES) {
  if (probe.pattern.test(probe.sample) !== probe.shouldMatch) {
    failures.push(
      `the matcher ${probe.pattern.source} ${probe.shouldMatch ? 'no longer matches' : 'now matches'} ` +
        `"${probe.sample}". This guard cannot be trusted until that is true again.`,
    )
  }
}

// --------------------------------------------------------------------------
console.log(`${TAG} debt register (${REGISTER.length}), printed every run on purpose:`)
for (const entry of REGISTER) {
  const stale = matched.has(entry.where) ? '' : '   <- STALE, this no longer matches'
  console.log(`${TAG}   ${entry.where}: ${entry.why}${stale}`)
}
for (const note of notes) console.log(`${TAG} ${note}`)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${failures.length} unescaped or() filter(s).`)
}

declareWork('or-filter-values-are-escaped', {
  did: {
    'file swept': filesSwept,
    'free-text or() filter judged': orCallsJudged,
    'filter escaped at the call': acceptedAtTheCall,
    'filter sanitised at the source': acceptedBySanitiser,
    'debt register entry': REGISTER.length,
    'matcher self-probe run': PROBES.length,
  },
  found: { 'unescaped or() filter outside the register': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(`${TAG} OK`)
