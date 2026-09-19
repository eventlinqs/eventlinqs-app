/**
 * GUARD: THE DISCOVERY QUESTION IS ASKED ONCE, UNTICKED, AND A DECLINE IS HONOURED.
 *
 * Close-out AQ1. The item is one sentence of law and four sentences of
 * acceptance, and each of the five clauses below is one of them made
 * unskippable. A rule that lives only in a review is a rule that lasts until
 * the next person is in a hurry.
 *
 *   1. NEVER PRE TICKED. No consent checkbox on any surface may carry
 *      `defaultChecked`, `checked={true}` or a `checked` attribute. AQ1: "Never
 *      pre ticked, never bundled with the terms, never inferred." A pre ticked
 *      box is not consent under the Spam Act 2003 and it is the single easiest
 *      thing to reintroduce, because it makes every opt-in number go up.
 *
 *   2. ASKED IN EXACTLY ONE PLACE. Both surfaces that can ask must resolve
 *      public.marketing_capture_placement, and the payment step must also check
 *      for an answer already carried. Two surfaces deciding for themselves is
 *      how one buyer gets asked the same question twice and says no once and
 *      yes once about the same thing.
 *
 *   3. EVERY DISCOVERY READER ASKS THE DOOR. Any module that reads
 *      public.audience_members to decide who hears about somebody else's event
 *      must pass its candidates through src/lib/consent/resolver.ts. Derived
 *      from the repository, so a fourth reader cannot appear quietly; the
 *      counts-only readers are a REGISTER with a reason each, printed on every
 *      run, and a register entry that stops matching is reported as STALE.
 *
 *   4. THE DECISION LOG IS APPEND ONLY IN THE SCHEMA. The conversion
 *      measurement reads that log to decide what "before" and "after" mean, so
 *      a row somebody could edit afterwards is a line the measurement is taken
 *      either side of that somebody could move.
 *
 *   5. THE TWO PERCENT RULE IS DECIDED IN WHOLE NUMBERS. A fall of exactly two
 *      points must hold, and on 19 September 2026 it did not: 580/1000 is
 *      57.99999999999999 in binary floating point, so an exact two point fall
 *      computed as 2.000000000000007 and the platform would have moved a
 *      consent capture off the surface that sells tickets on a rounding error.
 *      The comparison is integer arithmetic now and this clause keeps it that
 *      way.
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build host
 * with no database and no credentials. `src` and `supabase/migrations` both
 * survive the upload; several registered guards already read the second.
 *
 * Run standalone:  node scripts/guards/discovery-consent-is-asked-once-and-never-preticked.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[discovery-consent-is-asked-once-and-never-preticked]'

const SRC = join(ROOT, 'src')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const CHECKOUT_PAGE = 'src/app/checkout/[reservation_id]/page.tsx'
const EVENT_PAGE = 'src/app/events/[slug]/page.tsx'
const CONVERSION_MATH = 'src/lib/consent/capture-conversion-math.ts'
const PLACEMENT_MIGRATION = '20260919000110_marketing_capture_placement.sql'

/**
 * READERS OF THE AUDIENCE THAT DO NOT SEND, with the reason each one is not a
 * discovery query. A register rather than a suppression list: it is printed on
 * every run and an entry that no longer matches anything is a failure, so it
 * cannot rot into a list nobody has read since it was written.
 */
const COUNTS_ONLY_READERS = [
  {
    file: 'src/lib/audience/read.ts',
    since: '2026-09-19',
    why: 'GA1 point 6, the admin audience screen. Counts only: it selects no address at all, which the GA1 tests assert separately, so it cannot be a discovery query even by accident.',
  },
  {
    file: 'src/lib/attribution/read.ts',
    since: '2026-09-19',
    why: 'GA3. Reads the audience to report what a campaign already produced. It looks backwards at sends that happened and chooses nobody.',
  },
  {
    file: 'src/lib/attribution/store.ts',
    since: '2026-09-19',
    why: 'GA3. Writes the attribution record for an order that already exists. It resolves an audience member from an order, never an order from an audience.',
  },
]

/** Any call that puts a candidate in front of the one resolver. */
const DOOR_CALLS = ['resolveSend', 'filterPermittedRecipients', 'admitMatchRunToAllowlist']

/**
 * THE TWO WAYS THIS PLATFORM READS THE AUDIENCE, AND THE SECOND IS THE ONE A
 * GUARD MISSES.
 *
 * The first draft of this file looked for `from('audience_members')` only, and
 * reported a confident PASS over src/lib/attribution/read.ts and store.ts,
 * which reach the same table through a PostgREST embedded select:
 *
 *     .select('channel_code, audience_members(email)')
 *
 * That shape returns the same addresses and would have been invisible. Both are
 * matched now. It is the third blind gate found in this tree in two days, and
 * the only reason it was found is that the register said STALE for two files
 * that plainly do read the table.
 */
function readsTheAudience(source) {
  return source.includes("from('audience_members')") || /audience_members\s*\(/.test(source)
}

/**
 * Comments stripped, for the attribute checks only.
 *
 * The pre-tick clause reported this guard's own subject file as violating,
 * because the panel's header says "no defaultChecked and no checked attribute"
 * in prose. A guard that cannot tell code from the sentence describing it will
 * be switched off within a week.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

/**
 * IS THIS FUNCTION ACTUALLY CALLED HERE, rather than merely mentioned.
 *
 * THE DRILL FOUND THIS, not a reading of the code. Two of the five drills
 * passed on a violating tree because the first draft asked `includes(name)`,
 * and an import line carries the name as happily as a call does: renaming the
 * CALL left the import behind and the guard reported PASS over a page that no
 * longer resolved the placement. A declaration does the same thing, which is
 * how the two percent clause failed for the wrong reason.
 *
 * So the test is the one LB-FLAGCACHE arrived at on 19 September: a helper must
 * be CALLED somewhere that is neither its import nor its own declaration.
 */
function callsFunction(source, name) {
  const lines = source.split('\n')
  const kept = []
  let insideImport = false
  for (const line of lines) {
    if (insideImport) {
      if (/from\s+['"]/.test(line)) insideImport = false
      continue
    }
    if (/^\s*import\b/.test(line)) {
      if (!/from\s+['"]/.test(line)) insideImport = true
      continue
    }
    if (new RegExp('(function|const|let|var)\\s+' + name + '\\b').test(line)) continue
    kept.push(line)
  }
  return new RegExp('\\b' + name + '\\s*\\(').test(kept.join('\n'))
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const rel = p => relative(ROOT, p).split(sep).join('/')

function main() {
  const problems = []
  let scanned = 0
  let consentBoxes = 0
  let audienceReaders = 0
  let doorAsking = 0
  const matchedRegister = new Set()

  const files = walk(SRC).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const code = withoutComments(source)
    const name = rel(file)
    scanned += 1

    // ----------------------------------------------------------------- 1 ---
    const looksLikeConsentBox = /type="checkbox"/.test(code) && /consent/i.test(code)
    if (looksLikeConsentBox) {
      consentBoxes += 1
      const preticked = [
        [/defaultChecked(?!\s*=\s*\{?\s*false)/, 'defaultChecked'],
        [/checked=\{\s*true\s*\}/, 'checked={true}'],
        [/\schecked="checked"/, 'checked="checked"'],
      ].find(([pattern]) => pattern.test(code))
      if (preticked) {
        problems.push(
          `${name} renders a consent checkbox and carries ${preticked[1]}. AQ1: never pre ticked. ` +
            'A consent the person did not give is not consent, and under the Spam Act 2003 it is the ' +
            'kind of record ACMA fines people for relying on.',
        )
      }
    }

    // ----------------------------------------------------------------- 3 ---
    if (readsTheAudience(code)) {
      audienceReaders += 1
      const registered = COUNTS_ONLY_READERS.find(entry => entry.file === name)
      const asksTheDoor = DOOR_CALLS.some(call => callsFunction(code, call))
      if (asksTheDoor) doorAsking += 1
      if (registered) {
        matchedRegister.add(name)
        continue
      }
      if (!asksTheDoor) {
        problems.push(
          `${name} reads public.audience_members (directly or through an embedded select) and calls ` +
            `none of ${DOOR_CALLS.join(', ')}. ` +
            'A module that chooses who hears about somebody else’s event must pass every candidate ' +
            'through src/lib/consent/resolver.ts, or a buyer who declined is told about other events ' +
            'anyway. If it only counts, add it to COUNTS_ONLY_READERS with a reason.',
        )
      }
    }
  }

  // ------------------------------------------------------------------- 2 ---
  const checkout = existsSync(join(ROOT, CHECKOUT_PAGE)) ? readFileSync(join(ROOT, CHECKOUT_PAGE), 'utf8') : ''
  const eventPage = existsSync(join(ROOT, EVENT_PAGE)) ? readFileSync(join(ROOT, EVENT_PAGE), 'utf8') : ''

  if (!callsFunction(checkout, 'resolveCapturePlacement')) {
    problems.push(
      `${CHECKOUT_PAGE} does not resolve the capture placement. It would then ask the discovery ` +
        'question whatever the placement says, so moving the question to the ticket page would ask it twice.',
    )
  }
  if (!callsFunction(checkout, 'readCarriedAnswer')) {
    problems.push(
      `${CHECKOUT_PAGE} does not check for an answer already carried. A buyer who answered on the ` +
        'ticket page would be asked the same question again at the payment step.',
    )
  }
  if (!callsFunction(eventPage, 'resolveCapturePlacement')) {
    problems.push(
      `${EVENT_PAGE} does not resolve the capture placement. AQ1’s reversal condition moves the ` +
        'capture here, so a ticket page that cannot read the placement cannot be moved to.',
    )
  }

  // ------------------------------------------------------------------- 4 ---
  const migrationPath = join(MIGRATIONS, PLACEMENT_MIGRATION)
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
  if (!migration) {
    problems.push(`${PLACEMENT_MIGRATION} is missing, so the placement decision log has no schema.`)
  } else {
    for (const verb of ['update', 'delete', 'truncate']) {
      if (!migration.includes(`before ${verb} on public.marketing_capture_placement`)) {
        problems.push(
          `the placement decision log does not refuse ${verb.toUpperCase()}. The conversion measurement ` +
            'reads that log to decide what before and after mean, so an editable row is a measurement ' +
            'line somebody can move after the fact.',
        )
      }
    }
    if (!migration.includes('before update on public.marketing_capture_answer')) {
      problems.push(
        'the carried answer does not refuse UPDATE, so the answer recorded could differ from the answer given.',
      )
    }
  }

  // ------------------------------------------------------------------- 5 ---
  const math = existsSync(join(ROOT, CONVERSION_MATH)) ? readFileSync(join(ROOT, CONVERSION_MATH), 'utf8') : ''
  if (!callsFunction(math, 'fallExceedsLimit')) {
    problems.push(
      `${CONVERSION_MATH} no longer decides the two percent rule in whole numbers. A fall of exactly ` +
        'two points must HOLD, and in binary floating point 580/1000 is 57.99999999999999, so the ' +
        'division computes 2.000000000000007 and moves the capture off the surface that sells tickets ' +
        'on a rounding error.',
    )
  }
  if (/deltaPoints < -fallLimit/.test(math)) {
    problems.push(
      `${CONVERSION_MATH} compares the rounded delta against the limit directly. That is the exact ` +
        'comparison that failed on 19 September 2026; the decision goes through fallExceedsLimit.',
    )
  }

  console.log(`${TAG} the register of audience readers that count rather than send, ${COUNTS_ONLY_READERS.length}:`)
  for (const entry of COUNTS_ONLY_READERS) {
    const state = matchedRegister.has(entry.file) ? 'still reads audience_members' : 'STALE, it no longer matches'
    console.log(`${TAG}   ${entry.file} (since ${entry.since}, ${state})`)
    console.log(`${TAG}     ${entry.why}`)
  }

  /*
   * THE FINDING IS PRINTED BEFORE THE WORK REPORT, and the order is not
   * cosmetic. `declareWork` refuses a counter that came back zero and exits
   * where it stands, and the regression this guard exists to catch can be the
   * very thing that makes a counter zero: delete the last consent checkbox and
   * "consent checkbox rendered" is nought. The reader needs the finding, not a
   * note about a counter. Learned the hard way on LB-FLAGCACHE, where the drill
   * reported WRONG REASON for exactly this.
   */
  const stale = COUNTS_ONLY_READERS.filter(entry => !matchedRegister.has(entry.file))
  if (problems.length > 0) {
    console.error(`${TAG} the discovery question or the decline that answers it is not held:`)
    for (const p of problems) console.error(`${TAG}   ${p}`)
  }
  if (stale.length > 0) {
    console.error(`${TAG} a register entry no longer matches. Delete it or correct its path.`)
  }

  declareWork('discovery-consent-is-asked-once-and-never-preticked', {
    did: {
      'source file read': scanned,
      'consent checkbox surface': consentBoxes,
      'audience_members reader': audienceReaders,
      'reader that asks the consent door': doorAsking,
    },
    found: { 'clause broken': problems.length, 'counts-only reader registered': COUNTS_ONLY_READERS.length },
  })

  if (problems.length > 0 || stale.length > 0) process.exit(1)

  console.log(
    `${TAG} PASS: ${scanned} source file(s), ${consentBoxes} consent checkbox surface(s) none pre ticked, ` +
      `${audienceReaders} audience reader(s) of which ${doorAsking} ask the door and ` +
      `${COUNTS_ONLY_READERS.length} count only, the placement log append only, the two percent rule exact`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('discovery-consent-is-asked-once-and-never-preticked.mjs')) main()
