/**
 * GUARD: THE FORECAST TOOL READS ITS NUMBERS AND NAMES ITS METHOD.
 *
 * Close-out FT1. A free public tool that answers "how many do I have to sell"
 * is the strongest reason a stranger has to trust this platform, and there are
 * exactly two ways it stops being that. Either a fee, a price or a taxonomy
 * value gets typed into the page, so the tool quietly stops agreeing with what
 * the platform actually charges and actually offers; or the method sentence
 * goes missing, and arithmetic starts reading as a prediction. The owner's own
 * ruling is the standard here: a tool that lies on day one cannot be trusted on
 * day one hundred.
 *
 * WHAT IT CHECKS.
 *
 *   1. NO NUMERIC LITERAL, CURRENCY STRING OR PERCENTAGE IN THE RENDERING PATH.
 *      The page, the presenter and the arithmetic, with Tailwind class names
 *      and comments stripped first, and the exceptions listed BY NAME below.
 *   2. THE FEE COMES FROM THE RESOLVER. The page reads it through
 *      `readForecastOptions`, which reads `getLivePublicFee`, which is the same
 *      resolver the charge uses. Nothing else may hand the arithmetic a rate.
 *   3. THE TAXONOMY COMES FROM THE DATABASE. The reader queries the taxonomy
 *      tables, and neither the reader nor the page carries a list of event
 *      types or cities of its own.
 *   4. THE METHOD SENTENCE IS PRESENT AND IS CHOSEN BY THE METHOD. The page
 *      prints `methodSentence(methodOf(...))` rather than a string, so a page
 *      that ran arithmetic cannot print the measured sentence.
 *   5. THE MEASURED CLAIM IS OUT OF REACH while there is nothing to measure.
 *      `MEASURED_IS_REACHABLE` is false and `methodSentence` refuses the
 *      measured sentence while it is.
 *   6. THE CALL TO ACTION IS BELOW THE RESULT, in source order, which is the
 *      structural half of "one call to action under the result and nowhere
 *      above it".
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build
 * host, in CI and in the pre-push gate alike, and needs no database.
 *
 * Proven red and green: C:\\dev\\EVIDENCE\\FT1\\guard-drills.txt, harness
 * drill-guard.mjs beside it.
 *
 * Run: node scripts/guards/forecast-reads-every-number.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[forecast-reads-every-number]'

const PAGE = 'src/app/forecast/page.tsx'
const PRESENT = 'src/lib/forecast/present.ts'
const ARITHMETIC = 'src/lib/forecast/arithmetic.ts'
const READ = 'src/lib/forecast/read.ts'
const METHOD = 'src/lib/forecast/method.ts'

/**
 * THE EXCEPTIONS, LISTED BY NAME because a guard with an unexamined allowance
 * is a guard that grows one. Each is a number that is not a FEE, a PRICE or a
 * TAXONOMY VALUE.
 */
const ALLOWED_NUMBERS = [
  // Structure: array indices, comparisons against nothing, and a count of one.
  '0',
  '1',
  // The definition of a cent and of "per cent". Neither is a rate: the rate
  // arrives from pricing_rules through getLivePublicFee.
  '100',
  // The scenario fractions, which are FRACTIONS OF THE ORGANISER'S OWN ROOM and
  // are printed on the page as the assumptions they are. A quarter and a half.
  // They are not estimates of demand and must never become configuration; when
  // there is real sell-through to measure they are replaced, and the method
  // sentence changes with them.
  '2',
  '4',
]

const faults = []
const did = { 'rendering path file read': 0, 'literal judged': 0 }

function read(rel) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    faults.push(`${rel} does not exist, so the forecast tool cannot be judged`)
    return null
  }
  did['rendering path file read'] += 1
  return readFileSync(file, 'utf8')
}

/**
 * Strips comments and Tailwind class names, walking BRACES rather than matching
 * a regex, because a conditional className is `className={a ? 'x' : 'y'}` and a
 * regex anchored on a quote walks straight past it.
 */
function stripClassNames(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const at = source.indexOf('className=', i)
    if (at === -1) {
      out += source.slice(i)
      break
    }
    out += source.slice(i, at) + 'className=""'
    let j = at + 'className='.length
    if (source[j] === '{') {
      let depth = 0
      do {
        if (source[j] === '{') depth += 1
        else if (source[j] === '}') depth -= 1
        j += 1
      } while (j < source.length && depth > 0)
    } else if (source[j] === '"' || source[j] === "'" || source[j] === '`') {
      const quote = source[j]
      j += 1
      while (j < source.length && source[j] !== quote) j += 1
      j += 1
    }
    i = j
  }
  return out
}

function renderingCode(source) {
  return stripClassNames(
    source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split(String.fromCharCode(10))
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join(String.fromCharCode(10)),
  )
}

const NUMBER = /(?<![\w.[])\d+(?:[._]\d+)*(?![\w%\]])/g
const CURRENCY = /['"`](?:AUD|USD|GBP|NZD|EUR)['"`]|\$\d/
const PERCENT_LITERAL = /\d+(?:\.\d+)?\s*%|['"`]\d+(?:\.\d+)?\s*per cent/

/* ------------------------- 1. nothing typed in the rendering path ---------- */

const page = read(PAGE)
const present = read(PRESENT)
const arithmetic = read(ARITHMETIC)

for (const [rel, source] of [
  [PAGE, page],
  [PRESENT, present],
  [ARITHMETIC, arithmetic],
]) {
  if (!source) continue
  const code = renderingCode(source)
  for (const match of code.matchAll(NUMBER)) {
    did['literal judged'] += 1
    if (ALLOWED_NUMBERS.includes(match[0])) continue
    const line = code.slice(0, match.index).split(String.fromCharCode(10)).length
    faults.push(
      `${rel}:${line}: the number ${match[0]} is written into the forecast's rendering path. Every fee, price and taxonomy value here is a read; the allowed exceptions are ${ALLOWED_NUMBERS.join(', ')} and they are listed in this guard by name.`,
    )
  }
  if (CURRENCY.test(code)) {
    faults.push(
      `${rel}: a currency is written into the forecast. The currency comes from the fee configuration, which is the only thing that knows what this platform charges in.`,
    )
  }
  if (PERCENT_LITERAL.test(code)) {
    faults.push(
      `${rel}: a percentage is written into the forecast. The rate arrives from pricing_rules through getLivePublicFee and is never typed.`,
    )
  }
}

/* ------------------------------------- 2. the fee comes from the resolver -- */

{
  const reader = read(READ)
  if (reader) {
    /*
     * THE CALL, NOT THE MENTION. Until 18 September 2026 this read
     * `includes('getLivePublicFee')`, which an IMPORT LINE satisfies on its
     * own. Found by drilling this guard red for the first time: the drill
     * replaced the call with a hard-coded rate object, left
     * `import { getLivePublicFee } from '@/lib/pricing/live-fee'` at the top
     * exactly as a real regression would, and the guard passed.
     *
     * That is the precise thing FT1's GUARD line asks this to catch, in its own
     * words: "Proven red by hard coding the fee, then green." It would not have
     * been. A name in an import says the module was reachable once, never that
     * a value came from it.
     */
    if (!/\bgetLivePublicFee\s*\(/.test(renderingCode(reader))) {
      faults.push(
        `${READ} no longer CALLS getLivePublicFee. That resolver is the same one the CHARGE uses, which is the only reason a figure quoted here cannot drift from a figure charged later. An import of the name is not a read of the fee.`,
      )
    }
    if (page && /platformFeePercent\s*:\s*\d/.test(renderingCode(page))) {
      faults.push(`${PAGE} hands the arithmetic a rate of its own instead of the resolved one`)
    }
  }
}

/* --------------------------------- 3. the taxonomy comes from the database - */

{
  const reader = read(READ)
  if (reader) {
    for (const table of ['event_categories', 'cities']) {
      if (!reader.includes(`from('${table}')`)) {
        faults.push(
          `${READ} no longer reads ${table}. FT1 requires the event type list to come from the platform's own taxonomy in the database, never typed.`,
        )
      }
    }
  }
  /*
   * A LIST OF ITS OWN is the failure worth naming: a page that ships its own
   * array of event types looks identical to one that reads them, right up until
   * the taxonomy changes and the tool starts offering something the platform no
   * longer has.
   */
  if (page && /const\s+(EVENT_TYPES|CATEGORIES|CITIES)\s*=/.test(page)) {
    faults.push(`${PAGE} carries a taxonomy list of its own. The list is read, never held.`)
  }
}

/* ------------------------------------------- 4 and 5. the method sentence -- */

{
  const method = read(METHOD)
  if (page) {
    if (!page.includes('methodSentence(')) {
      faults.push(
        `${PAGE} does not print methodSentence(...). The sentence must be chosen by the method the calculation used, so a page that ran arithmetic cannot print the measured claim.`,
      )
    }
    if (!page.includes('data-forecast="method"')) {
      faults.push(`${PAGE} has lost the marker the driven proof finds the method sentence by`)
    }
  }
  if (method) {
    if (!/export const MEASURED_IS_REACHABLE = false/.test(method)) {
      faults.push(
        `${METHOD} says the measured claim is reachable. Nothing on this platform has enough sold tickets to measure yet, and shipping the better sentence ahead of the data is exactly what FT1 forbids.`,
      )
    }
    if (!method.includes("if (method === 'measured' && !MEASURED_IS_REACHABLE)")) {
      faults.push(`${METHOD} no longer refuses the measured sentence while measured is out of reach`)
    }
  }
}

/* ------------------------------- 6. the call to action is below the result - */

if (page) {
  const result = page.indexOf('data-forecast="break-even"')
  const cta = page.indexOf('data-forecast="cta"')
  if (result === -1 || cta === -1) {
    faults.push(`${PAGE} is missing the result or the call-to-action marker, so their order cannot be judged`)
  } else if (cta < result) {
    faults.push(
      `${PAGE} puts the call to action ABOVE the result. FT1: one call to action under the result and nowhere above it. A tool that asks for the signup before it has given the answer is an advertisement with a calculator on it.`,
    )
  }
}

/* ------------------------------------------------------------------ verdict */

declareWork('forecast-reads-every-number', {
  did,
  found: { 'typed or unread value': faults.length },
})

console.log(
  `${TAG} judged ${did['literal judged']} literal(s) across ${did['rendering path file read']} file(s) of the forecast's rendering path`,
)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} way(s) the forecast stops reading and starts claiming.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - every number is read, and the page names the method it used.`)
