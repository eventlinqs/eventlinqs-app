/**
 * GUARD: NO MARKETING MESSAGE LEAVES THIS PLATFORM WITHOUT THE ONE-CLICK
 * UNSUBSCRIBE PAIR, AND THE ADDRESS THOSE HEADERS NAME MUST EXIST.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on this tree on 19 September 2026.
 *
 * src/lib/email/send.ts handed Resend five fields and no headers, and a grep
 * for List-Unsubscribe across src, scripts, tests, docs and supabase matched
 * NOTHING. Both marketing send paths shipped without the headers, and no
 * endpoint existed that could have answered the POST they advertise.
 *
 * Google, "Email sender guidelines" (https://support.google.com/a/answer/81126,
 * fetched 2026-09-19): senders of "more than 5,000 messages per day to Gmail
 * accounts" must, "Starting February 1, 2024", include
 * "List-Unsubscribe-Post: List-Unsubscribe=One-Click" and a List-Unsubscribe
 * header. RFC 8058 (https://www.rfc-editor.org/rfc/rfc8058.html, fetched
 * 2026-09-19) defines the exact value and requires the URI to be HTTPS.
 *
 * WHY A GUARD RATHER THAN A TEST ALONE. The failure is invisible at every point
 * a person would look. The message renders, the body link works, the send
 * succeeds, the provider returns an id, and the drive goes green. Nothing is
 * red until a mailbox provider decides this sender does not support one-click
 * and starts folding the mail, which is a signal that arrives weeks later as a
 * deliverability number rather than as an error. A new marketing send path
 * added next month would reproduce it silently.
 *
 * ---------------------------------------------------------------------------
 * THE FIVE CLAUSES.
 *
 *   1. Every module classified marketing in src/lib/consent/send-paths.ts
 *      composes the pair in its OWN file, by calling
 *      oneClickUnsubscribeHeaders. The classification is already the human
 *      judgement about what is direct marketing; this clause makes that
 *      judgement carry a consequence. A new marketing entry that forgets the
 *      headers fails the build.
 *   2. The transport can carry them: SendEmailInput in src/lib/email/send.ts
 *      declares headers and the Resend call passes it. Without this the callers
 *      in clause 1 would compose a pair that is silently dropped one layer
 *      down, which is the worst of both states.
 *   3. The exact RFC 8058 bytes. LIST_UNSUBSCRIBE_POST_VALUE must be exactly
 *      "List-Unsubscribe=One-Click". A provider compares it literally, so a
 *      changed case or an added space is a non-conforming message that still
 *      looks right to a reviewer.
 *   4. The address the header names is a real route. ONE_CLICK_UNSUBSCRIBE_ROUTE
 *      must correspond to a route file on disk that exports POST. A header
 *      pointing at a 404 is worse than no header: it is a broken unsubscribe
 *      facility that a provider will test.
 *   5. GET on that route must not withdraw. Mail scanners follow GET links, so
 *      a mutating GET means a security appliance unsubscribes its owner and the
 *      ledger records a withdrawal nobody made. RFC 8058 specifies POST for
 *      exactly this reason.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARD CANNOT SEE, stated so nobody reads more into a pass.
 *
 * It reads source. It does not send mail and cannot confirm that Resend put the
 * headers on the wire, nor that a provider accepted them. That is what the
 * driven proof does, by reading the composed headers back out of the recorded
 * sink and by posting to the endpoint for real. It also judges only the paths
 * send-paths.ts classifies as marketing: a path that is misclassified is a
 * defect this guard is blind to by construction, which is why that file
 * requires a written reason per entry.
 *
 * NO SHEBANG (a leading #! breaks Vite when a test imports this module) and no
 * git call (the build host has no git). Both were paid for once already.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[one-click]'
const ROOT = process.cwd()

const SEND_PATHS_FILE = 'src/lib/consent/send-paths.ts'
const ONE_CLICK_FILE = 'src/lib/consent/one-click.ts'
const TRANSPORT_FILE = 'src/lib/email/send.ts'

/** RFC 8058. Written here as well as in the module so the two must agree. */
const REQUIRED_POST_VALUE = 'List-Unsubscribe=One-Click'
const COMPOSER = 'oneClickUnsubscribeHeaders'

/**
 * A marketing file must IMPORT the composer from the one definition and CALL
 * it. Both are regex LITERALS rather than patterns built from a template
 * string: a backslash class inside a template literal is not an escape, and a
 * guard whose matcher silently compiled to nonsense shipped blind in this tree
 * on 18 September 2026 and reported PASS over the very import it banned.
 */
const IMPORTS_COMPOSER = /import\s*\{[^}]*oneClickUnsubscribeHeaders[^}]*\}\s*from\s*'@\/lib\/consent\/one-click'/
const CALLS_COMPOSER = /oneClickUnsubscribeHeaders\s*\(/

/**
 * The argument list of a named call, by matching parentheses rather than by
 * taking a window of N characters after it. A window cannot tell where one call
 * ends and the next begins, which is how a scanner reports the absence of what
 * it cannot see, as a PASS.
 */
function argumentRegion(source, opening) {
  const at = source.indexOf(opening)
  if (at === -1) return null
  let depth = 0
  for (let i = at + opening.length - 1; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return source.slice(at, i + 1)
    }
  }
  return null
}

const failures = []
const notes = []

/**
 * WHAT THIS RUN ACTUALLY INSPECTED, counted rather than implied. A guard that
 * swept nothing prints the same OK as one that swept everything, which is the
 * founder ruling of 25 August 2026 and the reason the sixth drill above aims at
 * this guard's own matcher rather than at the product.
 */
const work = { clauses: 0, marketingPaths: 0, routeHandlers: 0 }

function read(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) return null
  return readFileSync(abs, 'utf8')
}

/**
 * The marketing entries, read out of the registry rather than listed here.
 *
 * Walks the entry objects rather than matching one pattern across the whole
 * file: a regex spanning two adjacent entries reports the kind of one and the
 * file of the other, which is the same class of mistake as a scanner that
 * cannot tell two adjacent database reads apart (LB-CEILING, 19 September
 * 2026).
 */
function marketingEntries(source) {
  const entries = []
  const fileRe = /file:\s*'([^']+)'/g
  let m
  while ((m = fileRe.exec(source)) !== null) {
    const file = m[1]
    // The kind belongs to THIS entry: it is the first kind: after this file:
    // and before the next file:.
    const rest = source.slice(m.index)
    const nextFile = rest.slice(1).search(/file:\s*'/)
    const window = nextFile === -1 ? rest : rest.slice(0, nextFile + 1)
    const kind = /kind:\s*'([^']+)'/.exec(window)
    if (kind && kind[1] === 'marketing') entries.push(file)
  }
  return entries
}

// --------------------------------------------------------------------------
// Clause 3 and the module itself, first: everything else refers to it.
// --------------------------------------------------------------------------
const oneClick = read(ONE_CLICK_FILE)
if (oneClick === null) {
  failures.push(ONE_CLICK_FILE + ' is missing. It is the single definition of the one-click headers.')
} else {
  const postValue = /LIST_UNSUBSCRIBE_POST_VALUE\s*=\s*'([^']*)'/.exec(oneClick)
  if (!postValue) {
    failures.push(ONE_CLICK_FILE + ' does not export LIST_UNSUBSCRIBE_POST_VALUE as a string literal.')
  } else if (postValue[1] !== REQUIRED_POST_VALUE) {
    failures.push(
      ONE_CLICK_FILE +
        ' sets LIST_UNSUBSCRIBE_POST_VALUE to "' +
        postValue[1] +
        '". RFC 8058 requires exactly "' +
        REQUIRED_POST_VALUE +
        '"; a receiver compares it literally, so a changed case or an added space is a ' +
        'non-conforming message that still reads correctly to a person.',
    )
  } else {
    work.clauses += 1
    notes.push('the List-Unsubscribe-Post value is exactly "' + REQUIRED_POST_VALUE + '"')
  }

  if (!/MUST contain one HTTPS URI/.test(oneClick) || !/protocol !== 'https:'/.test(oneClick)) {
    failures.push(
      ONE_CLICK_FILE +
        ' no longer refuses a non-HTTPS origin. RFC 8058 requires the List-Unsubscribe header to ' +
        'carry one HTTPS URI, and a http:// one is a facility that fails without telling anybody.',
    )
  } else {
    work.clauses += 1
    notes.push('a non-HTTPS, non-loopback origin is refused rather than composed')
  }
}

// --------------------------------------------------------------------------
// Clauses 4 and 5: the address the header names.
// --------------------------------------------------------------------------
if (oneClick) {
  const routeConst = /ONE_CLICK_UNSUBSCRIBE_ROUTE\s*=\s*'([^']*)'/.exec(oneClick)
  if (!routeConst) {
    failures.push(ONE_CLICK_FILE + ' does not export ONE_CLICK_UNSUBSCRIBE_ROUTE as a string literal.')
  } else {
    const routeRel = 'src/app' + routeConst[1] + '/[token]/route.ts'
    const route = read(routeRel)
    if (route === null) {
      failures.push(
        'ONE_CLICK_UNSUBSCRIBE_ROUTE is "' +
          routeConst[1] +
          '" but ' +
          routeRel +
          ' does not exist. Every marketing message would advertise an unsubscribe address that ' +
          'answers 404, which is a broken facility a mailbox provider will find before a person does.',
      )
    } else {
      if (!/export\s+async\s+function\s+POST\s*\(/.test(route)) {
        failures.push(
          routeRel +
            ' exports no POST handler. RFC 8058 one-click is an HTTPS POST; a route that cannot ' +
            'answer one is an unsubscribe facility in name only.',
        )
      } else {
        work.clauses += 1
        work.routeHandlers += 1
        notes.push(routeRel + ' answers POST')
      }

      // Clause 5: GET must not mutate. Read only the GET function body.
      const getAt = route.search(/export\s+async\s+function\s+GET\s*\(/)
      if (getAt !== -1) {
        const body = route.slice(getAt)
        const mutators = ['withdrawDigestByAnyToken', 'recordSuppressionEvent', 'writeWithdrawalToLedger']
        const found = mutators.filter((fn) => body.includes(fn))
        if (found.length > 0) {
          failures.push(
            routeRel +
              ' calls ' +
              found.join(', ') +
              ' inside GET. A mail scanner that follows the link would unsubscribe the person who ' +
              'owns the inbox, and the ledger would record a withdrawal nobody made. RFC 8058 ' +
              'specifies POST for this reason.',
          )
        } else {
          work.clauses += 1
          work.routeHandlers += 1
          notes.push('GET on that route withdraws nothing')
        }
      }
    }
  }
}

// --------------------------------------------------------------------------
// Clause 2: the transport can actually carry them.
// --------------------------------------------------------------------------
const transport = read(TRANSPORT_FILE)
if (transport === null) {
  failures.push(TRANSPORT_FILE + ' is missing.')
} else if (!/headers\?:\s*Record<string,\s*string>/.test(transport)) {
  failures.push(
    TRANSPORT_FILE +
      ' no longer declares an optional headers field on SendEmailInput, so a caller that composes ' +
      'the one-click pair has nowhere to put it.',
  )
} else {
  /*
   * THE PROVIDER CALL SPECIFICALLY, brace-matched, not a grep over the file.
   *
   * The first form of this clause searched the whole file for
   * "headers: input.headers" and would have passed on a transport that dropped
   * them, because the CONSOLE transport one screen above also forwards them for
   * the local inbox. A check satisfied by a different call than the one it
   * names is not a check. Same lesson as the scanner that could not tell two
   * adjacent database reads apart (LB-CEILING, 19 September 2026): if you judge
   * a call, find that call.
   */
  const providerCall = argumentRegion(transport, 'resend.emails.send(')
  if (providerCall === null) {
    failures.push(
      TRANSPORT_FILE +
        ' no longer contains a resend.emails.send( call this guard can read, so it cannot judge ' +
        'whether the headers reach the provider. A guard that cannot look is not a guard that passed.',
    )
  } else if (!/input\.headers/.test(providerCall)) {
    failures.push(
      TRANSPORT_FILE +
        ' declares headers but the resend.emails.send call does not pass them. The pair would be ' +
        'composed, accepted by the type system and dropped one layer down, which is worse than not ' +
        'composing it: every reviewer above this line would see correct code.',
    )
  } else {
    work.clauses += 1
    notes.push('the transport declares headers and the provider call passes them')
  }
}

// --------------------------------------------------------------------------
// Clause 1: every marketing send path composes the pair in its own file.
// --------------------------------------------------------------------------
const registry = read(SEND_PATHS_FILE)
if (registry === null) {
  failures.push(SEND_PATHS_FILE + ' is missing. It is the registry this guard judges against.')
} else {
  const marketing = marketingEntries(registry)
  if (marketing.length === 0) {
    failures.push(
      SEND_PATHS_FILE +
        ' classifies no path as marketing. Either the registry was emptied or the shape this guard ' +
        'walks has changed; a guard that silently judges nothing is the failure it was written to ' +
        'prevent.',
    )
  }
  for (const rel of marketing) {
    const source = read(rel)
    if (source === null) {
      failures.push(SEND_PATHS_FILE + ' classifies ' + rel + ' as marketing, but that file does not exist.')
      continue
    }
    /*
     * THE IMPORT AND THE CALL, both. `source.includes(COMPOSER)` alone is
     * satisfied by a COMMENT naming the function, which is precisely how a
     * removed call survives review: the word is still in the file. Requiring
     * the import binds the file to the one definition, and requiring the call
     * proves it is used rather than merely referenced.
     */
    const imported = IMPORTS_COMPOSER.test(source)
    const called = CALLS_COMPOSER.test(source)
    if (!imported || !called) {
      failures.push(
        rel +
          ' is classified marketing in ' +
          SEND_PATHS_FILE +
          ' but does not ' +
          (!imported && !called
            ? 'import or call ' + COMPOSER
            : !imported
              ? 'import ' + COMPOSER + " from '@/lib/consent/one-click'"
              : 'call ' + COMPOSER) +
          '. Every commercial message it sends would leave without the one-click unsubscribe pair ' +
          'Google requires of bulk senders from 1 February 2024.',
      )
    } else {
      work.clauses += 1
      work.marketingPaths += 1
      notes.push(rel + ' composes the pair')
    }
  }
  if (marketing.length > 0) {
    notes.push(marketing.length + ' marketing send path(s) judged')
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('marketing-mail-carries-one-click', {
  did: {
    'clause satisfied': work.clauses,
    'marketing send path judged': work.marketingPaths,
    'handler read on the one-click route': work.routeHandlers,
  },
  found: { 'marketing path that could send without one-click': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(TAG + ' OK')
