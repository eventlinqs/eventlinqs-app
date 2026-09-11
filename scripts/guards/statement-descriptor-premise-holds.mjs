/**
 * GUARD: the premise the connected-account health report rests on.
 *
 * WHY (11 September 2026, close-out S1). S1 asked, as its first requirement,
 * which Stripe charge type this platform uses, and told the build to read it
 * from the code rather than assume. Read: src/lib/payments/create-platform-charge.ts
 * is the only charge creator, and it passes no `on_behalf_of`, no
 * `transfer_data` and no `application_fee_amount`. That is SEPARATE CHARGES AND
 * TRANSFERS WITHOUT on_behalf_of, and Stripe publishes what follows:
 *
 *     "The customer's statement uses the platform account's static component for
 *     the following charge types: Destination charges without on_behalf_of;
 *     Separate charges and transfers without on_behalf_of"
 *     - https://docs.stripe.com/connect/statement-descriptors (fetched 2026-09-11)
 *
 * So on this platform an organiser's own descriptor, and therefore their legal
 * entity name, CANNOT reach a buyer's bank statement. That single absent
 * parameter is holding up an argument written into three places:
 * account-health.ts says the descriptor finding is never red and never claims a
 * chargeback; business-profile.ts says no buyer sees the connected prefix today;
 * and the deleted business-name band used to tell organisers the opposite and
 * was removed for saying it.
 *
 * Nothing anywhere said that absence was load-bearing. Adding `on_behalf_of` to
 * a charge is a one-line change that would pass every test in this repository
 * and would silently make all three of those statements false, on the day a real
 * buyer reads a real bank statement. Now something says it.
 *
 * THE THREE CLAUSES.
 *
 *   1. THE PREMISE. No charge this platform creates sets `on_behalf_of`. If one
 *      ever does, the connected account's descriptor becomes buyer-facing and
 *      the reasoning in account-health.ts must be revisited rather than
 *      inherited.
 *   2. ALWAYS SET, NEVER INHERITED. `createExpressAccount` sets BOTH
 *      `business_profile` and `settings.card_payments.statement_descriptor_prefix`
 *      in the same call. S1 requirement 3 says "always ... never left to
 *      Stripe's fallback", and the fallback is not benign: Stripe generates a
 *      descriptor from business_profile.name, then "doing business as", then
 *      business_profile.url, then the legal entity name, which is how two TEST
 *      accounts ended up with the prefix "EVENTLINQS.COM" taken from a URL an
 *      organiser typed.
 *   3. THE DELETED CHECK STAYS DELETED. The name comparison the founder ruled
 *      out on 11 September 2026 cannot return by any of its four old names. It
 *      compared a public trading name with a legal entity name, which Stripe
 *      holds as two separate fields by design, so it fired on correctly
 *      configured sole traders for ever and trained its reader to skip the
 *      email it lived in.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const CHARGE_MODULE = 'src/lib/payments/create-platform-charge.ts'
/**
 * The ONE module allowed to name on_behalf_of in a charge payload, and the
 * reason the exemption is safe is CHECKED below rather than trusted.
 *
 * src/lib/payments/stripe-adapter.ts is the gateway implementation. It can
 * EXPRESS a destination charge, behind a runtime refusal that demands all three
 * Connect fields together, but it can never ORIGINATE one: every on_behalf_of it
 * writes is read straight off `params`. So the decision is always a caller's,
 * and clause 1 judges every caller. Exempting the adapter without checking that
 * would be an allowlist entry nobody re-examines, which this repository has been
 * burned by before.
 */
const GATEWAY = 'src/lib/payments/stripe-adapter.ts'
const CONNECT_MODULE = 'src/lib/stripe/connect.ts'
const CREATOR = 'createExpressAccount'

/** The four names the deleted comparison went by. Any of them back in src/ is
 *  the check returning, whatever the file it returns in. */
const DELETED_SYMBOLS = [
  'businessNameDivergence',
  'normaliseBusinessName',
  'getConnectedBusinessName',
  'BusinessNameMismatch',
]

export function sourceFiles(root, dir) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.tsx?$/.test(entry)) out.push(relative(root, full).replace(/\\/g, '/'))
    }
  }
  walk(dir)
  return out
}

/**
 * Lines that actually SET `on_behalf_of` on a charge, not lines that mention it.
 *
 * Narrow on purpose, and the narrowing is the whole difference between a guard
 * that survives and one somebody switches off. The phrase appears legitimately
 * all over this tree in PROSE: create-platform-charge.ts explains in a comment
 * that it sets no on_behalf_of and quotes Stripe's page about it,
 * account-health.ts reasons about the day somebody adds it, and
 * stripe-adapter.ts carries a deprecated destination-charge path behind a
 * runtime refusal. A guard that fires on any of those is a guard that gets
 * deleted within a week, and then the defect it exists to stop ships.
 *
 * So: comment lines are skipped, and a hit must look like an assignment or an
 * object property rather than a mention.
 */
export function onBehalfOfAssignments(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  let inBlockComment = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      continue
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true
      continue
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    // `on_behalf_of: something` or `on_behalf_of = something`, where something
    // is not `undefined`. A property in a TYPE declaration (`on_behalf_of?:`)
    // is a shape, not a charge, and is not a hit.
    if (!/\bon_behalf_of\s*[:=]/.test(line)) continue
    if (/\bon_behalf_of\s*\?\s*:/.test(line)) continue
    if (/\bon_behalf_of\s*[:=]\s*undefined\b/.test(line)) continue
    out.push({ line: i + 1, text: trimmed })
  }
  return out
}

/** The body of a named exported function, so a clause can judge one call rather
 *  than the whole file. Brace counting is enough here: the target is a single
 *  top-level function and the tree is prettier-formatted. */
export function functionBody(text, name) {
  const start = text.indexOf(`export async function ${name}(`)
  if (start === -1) return null
  const open = text.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return text.slice(open, i + 1)
    }
  }
  return null
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const root = resolve(here, '..', '..')
  const tag = '[statement-descriptor-premise-holds]'
  const problems = []

  const files = sourceFiles(root, join(root, 'src'))

  /* ---- clause 1: no CALLER supplies on_behalf_of ---- */
  let chargeFilesJudged = 0
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8')
    if (!text.includes('on_behalf_of')) continue
    chargeFilesJudged += 1

    // The gateway may pass one through; it may not invent one. Checking that is
    // what makes exempting it from the clause below honest.
    if (file === GATEWAY) {
      for (const hit of onBehalfOfAssignments(text)) {
        if (/on_behalf_of\s*:\s*params\.on_behalf_of/.test(hit.text)) continue
        problems.push(
          `${file}:${hit.line} sets on_behalf_of from something other than its own params (${hit.text}). ` +
            `The gateway is exempt from clause 1 only because it cannot originate a destination charge, and this line means it now can.`,
        )
      }
      continue
    }

    for (const hit of onBehalfOfAssignments(text)) {
      problems.push(
        `${file}:${hit.line} sets on_behalf_of (${hit.text}). ` +
          `That changes whose statement descriptor the BUYER sees: Stripe uses the CONNECTED account's static component for "Separate charges and transfers with on_behalf_of" ` +
          `(https://docs.stripe.com/connect/statement-descriptors). Three places in this tree state, as fact, that no buyer sees a connected account's descriptor on this platform: ` +
          `src/lib/stripe/account-health.ts, src/lib/stripe/business-profile.ts and the close-out S1 record. Revisit all three before this ships, rather than letting them go quietly false.`,
      )
    }
  }

  /* ---- clause 2: the creator sets both, in the same call ---- */
  try {
    const connect = readFileSync(join(root, CONNECT_MODULE), 'utf8')
    const body = functionBody(connect, CREATOR)
    if (!body) {
      problems.push(`${CONNECT_MODULE} no longer exports ${CREATOR}, so clause 2 is judging nothing. Point it at whatever creates a connected account now.`)
    } else {
      if (!/business_profile\s*:/.test(body)) {
        problems.push(`${CREATOR} does not pass business_profile. Stripe then asks the organiser to retype a name the platform already holds, and generates their descriptor from whatever they type.`)
      }
      if (!/statement_descriptor_prefix\s*:/.test(body)) {
        problems.push(
          `${CREATOR} does not set settings.card_payments.statement_descriptor_prefix. Close-out S1 requirement 3: always set it explicitly, never left to Stripe's fallback. ` +
            `Stripe's fallback walks business_profile.name, then "doing business as", then business_profile.url, then the legal entity name, which is how acct_1TkUNdGvPFuaplvP and acct_1TkUM42esnSE7XnC both ended up describing themselves as "EVENTLINQS.COM".`,
        )
      }
    }
  } catch (error) {
    problems.push(`${CONNECT_MODULE} is unreadable (${error.message}), so clause 2 could not run.`)
  }

  /* ---- clause 3: the deleted comparison has not returned ---- */
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8')
    for (const symbol of DELETED_SYMBOLS) {
      if (!new RegExp(`\\b${symbol}\\b`).test(text)) continue
      problems.push(
        `${file} names ${symbol}. The founder deleted the business-name comparison on 11 September 2026 and ruled it out rather than softened: ` +
          `Stripe holds a public trading name and a legal entity name as two separate fields by design, so for a sole trader they differ correctly, and the check fired on healthy accounts for ever. ` +
          `What replaced it is src/lib/stripe/account-health.ts, which reports the fields that actually determine whether money moves.`,
      )
    }
  }

  /* ---- the premise of clause 1, checked rather than remembered ---- */
  try {
    const charge = readFileSync(join(root, CHARGE_MODULE), 'utf8')
    if (!/createPaymentIntent\(/.test(charge)) {
      problems.push(`${CHARGE_MODULE} no longer creates a payment intent, so clause 1 may be guarding a module that is no longer the charge path. Point it at the one that is.`)
    }
  } catch (error) {
    problems.push(`${CHARGE_MODULE} is unreadable (${error.message}), so the premise of clause 1 could not be checked.`)
  }

  declareWork('statement-descriptor-premise-holds', {
    did: {
      'source file scanned': files.length,
      'file mentioning on_behalf_of judged': chargeFilesJudged,
      'gateway pass-through verified': 1,
      'clause checked': 3,
    },
    found: { 'break in the statement-descriptor premise': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${tag} FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  A buyer who does not recognise the name on their bank statement disputes the charge.')
    console.error('  Which name that is depends on one Stripe parameter, and on nothing else.')
    process.exitCode = 1
    return
  }
  console.log(
    `${tag} PASS - no caller supplies on_behalf_of and the gateway can only pass one through, ${CREATOR} sets both the business profile and the descriptor prefix, ` +
      `and the deleted name comparison has not returned under any of its ${DELETED_SYMBOLS.length} old names.`,
  )
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
