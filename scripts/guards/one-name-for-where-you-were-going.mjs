/**
 * GUARD: EVERY LOGIN DEEP LINK THE PLATFORM WRITES IS ONE THE SIGN-IN FORM
 * READS, AND ONE FUNCTION DECIDES WHETHER IT MAY BE FOLLOWED.
 *
 * ============================================================================
 * THE DEFECT THIS EXISTS TO STOP, counted on 21 September 2026
 * ============================================================================
 *
 * A parameter written by one half of a platform and read by the other half is
 * held together by nothing but a shared memory of its name, and this one had
 * already come apart:
 *
 *     emitted as ?redirect=   12 places, and read
 *     emitted as ?next=        9 places, and read by NOBODY
 *
 * `login-form.tsx` called `searchParams.get('redirect')` and nothing else, so
 * all nine of those deep links dropped the person on the dashboard instead of
 * the page they had asked for. Nothing failed. No test covered it, because a
 * test would have had to know both spellings existed, which is precisely the
 * thing nobody knew.
 *
 * Two of the nine are not merely annoying. `/scan/[eventId]` is a door staffer
 * at a venue, on their phone, opening the scanner link they were sent: they sign
 * in and land on an organiser dashboard with a queue behind them.
 * `/squad/[token]/pay/[member_id]` is somebody paying their share of a group
 * booking, and the payment is simply gone from under them.
 *
 * ============================================================================
 * AND THE SECOND HALF, WHICH IS A SECURITY QUESTION RATHER THAN A UX ONE
 * ============================================================================
 *
 * The two copies of the "is this path safe to follow" check had drifted, in the
 * direction that matters. The magic-link route rejected a BACKSLASH; the login
 * form's inline copy did not. Measured:
 *
 *     new URL('/\\evil.com', 'https://eventlinqs.com.au/login').href
 *       -> 'https://evil.com/'
 *
 * WHATWG URL parsing treats a backslash as a forward slash for special schemes,
 * so `/\evil.com` is protocol-relative in effect. The login form asked "does it
 * start with `//`", this does not, and it was handed to `router.push`. An open
 * redirect is worst on the sign-in page, where somebody has just typed their
 * password and is watching for the app to take them somewhere.
 *
 * So the second clause is not "please reuse the helper". It is: a hand-rolled
 * copy of this check WILL drift, it already did, and the drift is an open
 * redirect on the most sensitive page on the platform.
 *
 * ============================================================================
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied
 * ============================================================================
 *
 * It reads the SOURCE. A deep link assembled at runtime from a variable
 * (`/login?${key}=${path}`) is invisible to it, and so is a parameter read
 * through a helper it does not know about. It judges the literal spellings,
 * which is where every one of the twenty-one real emitters lives and where the
 * defect came from. A guard that tried to do more would need to be satisfied by
 * a judgement rather than by a fact, and a guard like that gets switched off.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFiles, readSource } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')

/** The one place that decides where a person goes and whether they may go there. */
const RESOLVER = 'src/lib/auth/safe-redirect.ts'

/** The form that reads the parameter. If it stops reading one, the build stops. */
const SIGN_IN_FORM = 'src/components/auth/login-form.tsx'

/**
 * The spellings the sign-in form is required to understand.
 *
 * BOTH, and neither is a legacy alias to be tidied away. `next` is Supabase's
 * own name and `/auth/callback` and `/auth/confirm` have always read it;
 * `redirect` is what the page guards mostly emit. The tree uses both on purpose
 * and the form's job is to answer to either.
 */
const ACCEPTED = ['redirect', 'next']

const failures = []
const fail = (message) => failures.push(message)

const read = (rel) => (existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), 'utf8') : null)

/* ------------------------------------------------------------------ clause 1 */
/* The resolver exists, and the form reaches it.                               */

const resolverSrc = read(RESOLVER)
if (resolverSrc === null) {
  fail(`${RESOLVER} does not exist. It is the one place that decides where a person goes after signing in.`)
}

/*
 * TWO TESTS, NOT ONE, AND THE SECOND IS THE ONE WITH TEETH.
 *
 * The first version of this clause asked only whether `readRedirectParam`
 * appeared anywhere in the form. Its drill - putting `searchParams.get('redirect')`
 * back into the password branch - did NOT make it fail, because the form calls
 * the resolver twice (password and magic link) and one `.test()` cannot tell two
 * occurrences from one. The guard was blind in exactly the direction that
 * mattered: half the form could go back to reading the parameter itself and the
 * build would stay green.
 *
 * So the binding check is the NEGATIVE one. The form must not read the parameter
 * directly at all, whatever else it does.
 */
const formSrc = read(SIGN_IN_FORM)
if (formSrc === null) {
  fail(`${SIGN_IN_FORM} does not exist, so this guard cannot tell what the sign-in form reads.`)
} else {
  if (!/readRedirectParam/.test(formSrc)) {
    fail(
      `${SIGN_IN_FORM} no longer calls readRedirectParam. That function is the only thing that knows BOTH ` +
        `spellings of the deep link, and the last time the form did its own reading it understood one of them ` +
        `and nine pages in this tree emitted the other.`,
    )
  }
  for (const name of ACCEPTED) {
    const direct = new RegExp(`searchParams\\.get\\(\\s*['"]${name}['"]\\s*\\)`)
    if (direct.test(formSrc)) {
      fail(
        `${SIGN_IN_FORM} reads the '${name}' parameter directly. Every branch of this form goes through ` +
          `readRedirectParam, because a branch that reads the parameter itself knows one spelling and there ` +
          `are two, and it applies its own safety check and there is one. Both halves of that sentence have ` +
          `already been a defect on this page.`,
      )
    }
  }
}

/* ------------------------------------------------------------------ clause 2 */
/* Every spelling the resolver promises to read, it actually reads.            */

let spellingsRead = 0
if (resolverSrc !== null) {
  for (const name of ACCEPTED) {
    if (new RegExp(`get\\(\\s*['"]${name}['"]\\s*\\)`).test(resolverSrc)) {
      spellingsRead += 1
    } else {
      fail(
        `${RESOLVER} does not read the '${name}' parameter. ${
          name === 'next'
            ? 'Nine pages emit ?next= and /auth/callback and /auth/confirm have always read it.'
            : 'Twelve pages emit ?redirect=.'
        } A spelling the platform writes and nothing reads is a deep link that silently goes nowhere.`,
      )
    }
  }
}

/* ------------------------------------------------------------------ clause 3 */
/* Every login deep link that carries a DESTINATION uses a spelling that is    */
/* read. Status parameters are not destinations and are none of this guard's   */
/* business: /login?error=..., ?reset=1 and ?email=... say what happened, not  */
/* where to go afterwards.                                                     */

const files = sourceFiles(ROOT, { subdir: 'src' }).filter((f) => /\.tsx?$/.test(f))

/**
 * `/login?name=` and enough of the value to tell a destination from a message.
 *
 * Read from the COMMENT-STRIPPED view, because two files in this tree document
 * the shape `/login?email=...&password=...` in prose while explaining a
 * credential-scrubbing rule, and a guard that cannot tell a sentence from a
 * `router.push` reports two faults that do not exist.
 */
const EMITTER = /\/login\?([a-zA-Z_]+)=([^`'"\s&]*)/g

/**
 * Is this parameter carrying somewhere to GO?
 *
 * A literal that begins with `/` is a path. An interpolation is a path when what
 * it interpolates is named like one. Anything else is a message, and messages
 * are not this guard's subject.
 */
function carriesADestination(value) {
  if (value.startsWith('/')) return true
  if (!value.startsWith('${')) return false
  return /path|pathname|url|next|redirect|return|href|slug/i.test(value)
}

let emitters = 0
let messages = 0
const spellingsEmitted = new Set()

for (const file of files) {
  const abs = resolve(ROOT, file)
  if (!existsSync(abs)) continue
  const { withStrings } = readSource(abs)
  for (const match of withStrings.matchAll(EMITTER)) {
    const [, name, value] = match
    if (!carriesADestination(value)) {
      messages += 1
      continue
    }
    emitters += 1
    spellingsEmitted.add(name)
    if (!ACCEPTED.includes(name)) {
      fail(
        `${file} sends somebody to /login?${name}=<a path>, and the sign-in form reads only ` +
          `${ACCEPTED.map((a) => `'${a}'`).join(' and ')}. They would sign in and be dropped on ` +
          `/dashboard instead of where they were going, silently, exactly as the nine ?next= links ` +
          `did before 21 September 2026. Use an accepted spelling, or teach ${RESOLVER} the new one ` +
          `and add it to ACCEPTED here.`,
      )
    }
  }
}

/* ------------------------------------------------------------------ clause 4 */
/* Nobody on an auth surface hand-rolls the safety check, because the last two */
/* copies drifted and the drift was an open redirect.                          */

/*
 * SCOPED TO THE AUTH SURFACES AND TO ANYTHING THAT EMITS A LOGIN DEEP LINK,
 * rather than to every file under src, and the reason is a real case this guard
 * got wrong first time round. `src/lib/organisations/switch-action.ts` tests
 * `startsWith('//')` too, but it tests it alongside `startsWith('/dashboard')`,
 * which ANCHORS the path to one prefix and is strictly stronger than the general
 * check. Firing on it would have taught the next person that this guard cries
 * wolf, which is how a guard stops being read.
 */
const AUTH_SURFACES = ['src/components/auth/', 'src/app/api/auth/', 'src/app/auth/']
/**
 * The exact value the drifted copy waved through, built from its character code
 * so that no layer of quoting between here and a terminal can eat it. Measured:
 * it resolves to https://evil.com/ under WHATWG URL parsing.
 */
const OFF_ORIGIN = `'/${String.fromCharCode(92)}evil.com'`

const PROTOCOL_RELATIVE_TEST = /startsWith\(\s*['"]\/\/['"]\s*\)/

let handRolled = 0
let authFilesJudged = 0
for (const file of files) {
  const rel = file.replace(/\\/g, '/')
  if (rel.endsWith(RESOLVER)) continue
  if (!AUTH_SURFACES.some((dir) => rel.includes(dir))) continue
  const abs = resolve(ROOT, file)
  if (!existsSync(abs)) continue
  authFilesJudged += 1
  /*
   * `withStrings`, NOT `code`. The comment-stripped view KEEPS string contents;
   * the code-only view blanks them, and the thing being looked for is a STRING
   * LITERAL. The first version of this clause read `code`, so the drill that
   * plants a hand-rolled `startsWith('//')` in an auth route did not make it
   * fail: the guard was searching bytes that had already been blanked out.
   */
  const { withStrings } = readSource(abs)
  if (PROTOCOL_RELATIVE_TEST.test(withStrings)) {
    handRolled += 1
    fail(
      `${file} tests for a protocol-relative path itself. There is one function for this, ` +
        `safeRedirectPath in ${RESOLVER}, and the reason it is one function is that when it was two they ` +
        `drifted: one rejected a backslash and the other did not, and ${OFF_ORIGIN} resolves to ` +
        `'https://evil.com/'.`,
    )
  }
}

/* ------------------------------------------------------------------- verdict */

declareWork('one-name-for-where-you-were-going', {
  did: {
    'file swept': files.length,
    'destination link judged': emitters,
    'parameter left alone as a message': messages,
    'auth file checked for a second copy of the check': authFilesJudged,
    'spelling checked against the resolver': ACCEPTED.length,
  },
  found: {
    'spelling wired into the resolver': spellingsRead,
    'spelling emitted by the tree': spellingsEmitted.size,
    'hand-rolled safety check': handRolled,
  },
  zeroIsFine: { 'hand-rolled safety check': true },
})

if (failures.length > 0) {
  console.error('\n[one-name-for-where-you-were-going] FAIL - a deep link goes nowhere, or a check was copied.\n')
  for (const f of failures) console.error(`  - ${f}\n`)
  process.exit(1)
}

console.log(
  `\n[one-name-for-where-you-were-going] PASS - ${emitters} login deep link(s) across ` +
    `${spellingsEmitted.size} spelling(s), every one of them read by the sign-in form, and one function ` +
    `decides whether any of them may be followed.`,
)
