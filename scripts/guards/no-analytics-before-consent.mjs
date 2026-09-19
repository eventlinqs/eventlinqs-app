/**
 * GUARD: NOTHING REACHES AN ANALYTICS OR ADVERTISING HOST BEFORE CONSENT.
 *
 * Close-out AN1. The platform now loads four third-party measurement scripts,
 * three of which can recognise a person on other websites. The rule is that
 * none of them is requested until somebody has said yes, and the failure this
 * guards against is silent in the worst possible direction: the page still
 * works, the data still flows, and the platform is loading an advertising
 * tracker for a person who refused. Nobody notices from the outside, and the
 * people harmed by it are exactly the ones who took the trouble to say no.
 *
 * WHAT IT CHECKS.
 *
 *   1. EVERY PROVIDER HOST APPEARS ONLY INSIDE THE GATE. The hosts are
 *      enumerated once, in src/lib/analytics/providers.ts. Any of them written
 *      anywhere else under src/ is a second way in, and a second way in is the
 *      one that will not be gated. The privacy and cookie pages are permitted
 *      to NAME a provider in prose; what is refused is a host in a fetch, a
 *      script src or an import.
 *   2. THE GATE ASKS BOTH QUESTIONS. Every provider in the registry is emitted
 *      through `mayLoad`, which requires the category to be granted AND the
 *      identifier to be configured. A tag that checks only the identifier loads
 *      for everybody the moment the owner pastes a key in.
 *   3. THE GATE RENDERS NOTHING BEFORE THE DECISION IS READ. The consent cookie
 *      is read in an effect, so the first tick does not know the answer, and
 *      the honest answer on a tick that does not know is "no".
 *   4. THE DEFAULT IS REFUSAL. `NO_CONSENT` grants nothing, and every failure
 *      path in the decoder returns it.
 *   5. THE REGISTRY AND THE GATE NAME THE SAME PROVIDERS. Next inlines a public
 *      environment value only when it sees the literal member expression, so
 *      the gate writes the four names out; if the registry gains a fifth and
 *      the gate does not, the fifth silently never loads and the platform
 *      quietly measures nothing while reporting that it does.
 *   6. A PROVIDER IDENTIFIER IS READ ONLY WHERE READING IT MEANS SOMETHING.
 *      Nowhere under src/ but the gate and the server capture, and NOWHERE
 *      under scripts/ at all: a NEXT_PUBLIC value reaches a browser because the
 *      SERVER inlined it, so a verification script reading its own environment
 *      is answering a question about a different machine. The version of the
 *      AN1 drive that did this reported 36 of 36 while testing nothing about
 *      the half it claimed to test. Added 19 September 2026.
 *   7. THE DRIVE'S JUDGEMENT AND THE GATE NAME THE SAME SCRIPT ELEMENTS. The
 *      drive learns what the browser was given by looking for the gate's script
 *      elements by id; a rename on one side alone leaves it looking for
 *      something that cannot appear and calling the platform unconfigured.
 *
 * WHY IT IS STATIC AND NOT A BROWSER. The registered guards run on `prebuild`,
 * including on the Vercel build host, where there is no server to load a page
 * from. A guard that cannot run there is a guard that gets dropped from the
 * chain. The NETWORK proof, loading the homepage, /organisers and an event page
 * with no consent and watching every request, is the driven half and lives in
 * scripts/verify/an1-consent-drive.mjs; this half is what fails a build.
 *
 * Proven red and green five ways, each drill restoring what it broke:
 * C:\\dev\\EVIDENCE\\AN1\\guard-drills.txt, harness drill-guard.mjs beside it.
 *
 * Run: node scripts/guards/no-analytics-before-consent.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const TAG = '[no-analytics-before-consent]'

const PROVIDERS_FILE = 'src/lib/analytics/providers.ts'
const CONSENT_FILE = 'src/lib/analytics/consent.ts'
const GATE_FILE = 'src/components/analytics/gated-analytics.tsx'

/**
 * Files allowed to write a provider host, and why. Each is a place the host is
 * DESCRIBED rather than requested.
 */
const HOST_ALLOWED = [
  { path: PROVIDERS_FILE, why: 'the registry itself: it is the list, and the list has to contain the names' },
  { path: GATE_FILE, why: 'the one gate that emits the scripts, behind mayLoad' },
  { path: 'src/lib/analytics/funnel-server.ts', why: 'the server capture for the one step a browser cannot witness; no key, no request' },
  { path: 'src/app/legal/cookies/page.tsx', why: 'the cookie policy names each provider in prose, which is the point of it' },
  { path: 'src/app/legal/privacy/page.tsx', why: 'the privacy policy names each provider in prose, same reason' },
]

const faults = []
const checks = {
  'source file swept': 0,
  'provider judged': 0,
  'gate property asserted': 0,
  'identifier read judged': 0,
  'gate script element judged': 0,
}

function read(rel) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    faults.push(`${rel} is missing, and the consent gate cannot be judged without it`)
    return null
  }
  return readFileSync(file, 'utf8')
}

/* ------------------------------------------------------------ the registry */

const providersSource = read(PROVIDERS_FILE)
const hosts = providersSource
  ? [...providersSource.matchAll(/hosts:\s*\[([^\]]*)\]/g)]
      .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(h => h[1]))
      .filter(Boolean)
  : []
const envVars = providersSource
  ? [...providersSource.matchAll(/envVar:\s*'([A-Z0-9_]+)'/g)].map(m => m[1])
  : []

if (providersSource && hosts.length === 0) {
  faults.push(`${PROVIDERS_FILE} lists no provider hosts. The sweep below would then pass over anything, which is a guard reporting that it found nothing because it looked for nothing`)
}

/* ------------------------------- 1. no host written anywhere but the gate */

function* walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) yield* walk(rel)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) yield rel
  }
}

const allowedPaths = new Set(HOST_ALLOWED.map(a => a.path))
for (const rel of walk('src')) {
  checks['source file swept'] += 1
  if (allowedPaths.has(rel)) continue
  const source = readFileSync(join(ROOT, rel), 'utf8')
  for (const host of hosts) {
    if (source.includes(host)) {
      faults.push(
        `${rel} names the provider host ${host}. Every request to a measurement or advertising host goes through ${GATE_FILE}, behind mayLoad; a second place that names one is the one that will not be gated`,
      )
    }
  }
}

/* ------------------------------------- 2 and 5. the gate, and both questions */

const gate = read(GATE_FILE)
if (gate) {
  for (const envVar of envVars) {
    checks['provider judged'] += 1
    // The LITERAL member expression, because that is the only form Next inlines.
    if (!gate.includes(`process.env.${envVar}`)) {
      faults.push(
        `${GATE_FILE} does not read process.env.${envVar} as a literal member expression. Next inlines a public value only when it sees that exact form, so a computed lookup is undefined in the browser and the provider silently never loads, while the platform reports that it is measuring`,
      )
    }
  }
  const mayLoadCalls = [...gate.matchAll(/mayLoad\(\{/g)].length
  checks['gate property asserted'] += 1
  if (mayLoadCalls < envVars.length) {
    faults.push(
      `${GATE_FILE} calls mayLoad ${mayLoadCalls} time(s) for ${envVars.length} registered provider(s). Every provider asks BOTH questions, the category and the identifier; a tag gated on the identifier alone loads for everybody the moment a key is pasted in`,
    )
  }
  checks['gate property asserted'] += 1
  if (!/if \(loading\) return null/.test(gate)) {
    faults.push(
      `${GATE_FILE} no longer refuses to render while the decision is still being read. The cookie is read in an effect, so the first tick does not know the answer, and the honest answer on a tick that does not know is no`,
    )
  }
}

/* ---- 6. no verification decides from its own environment what the browser got */

/**
 * A `NEXT_PUBLIC_*` value reaches a browser because the SERVER inlined it at
 * compile time. A script under scripts/ is a different process with a different
 * environment, so `process.env.NEXT_PUBLIC_POSTHOG_KEY` there answers a
 * question about the wrong machine.
 *
 * WHY THIS IS A CLAUSE AND NOT A NOTE. It was in `an1-consent-drive.mjs` from
 * 14 to 19 September and it failed in both directions at once. With the four
 * names absent from the drive's shell it asserted zero requests after
 * accepting, which is character for character what the refusal check three
 * lines above already asserts, so the positive half of acceptance 2 went
 * untested while the run printed 36 of 36. And with the four names present in
 * the drive's shell but not the server's it would have demanded requests from a
 * browser that was correctly given nothing, and accused a working platform.
 *
 * What the browser was given is OBSERVED IN THE BROWSER: the gate's own script
 * elements, judged by scripts/verify/lib/an1-accepted-loads.mjs.
 *
 * NAMING one of these variables as a string is fine and is not what this looks
 * for: scripts/ops/set-measurement-identifiers.mjs exists to write them, and a
 * refusal message has to be able to say which one is missing. What is refused
 * is READING the value.
 */
const IDENTIFIER_READ_ALLOWED = [
  {
    path: 'src/components/analytics/gated-analytics.tsx',
    why: 'the gate itself, where the literal member expression is the only form Next inlines',
  },
  {
    path: 'src/lib/analytics/funnel-server.ts',
    why: 'the server capture for the one step a browser cannot witness: it runs IN the server, so its own environment is the right one to read',
  },
]

/**
 * COMMENTS ARE NOT CODE, and this clause is about reading a value.
 *
 * The first run of clause 6 failed on two files whose only mention of an
 * identifier was the prose explaining why reading one there would be wrong,
 * including this guard's own header. A guard that cannot tell an instruction
 * from a description of an instruction teaches people to stop writing the
 * description, which is the opposite of what this repository wants.
 *
 * Removal only: stripping can never CREATE a `process.env.X`, so a file that
 * survives this genuinely does not read one.
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const identifierAllowed = new Set(IDENTIFIER_READ_ALLOWED.map(a => a.path))
for (const dir of ['src', 'scripts']) {
  for (const rel of walk(dir)) {
    if (identifierAllowed.has(rel)) continue
    const source = withoutComments(readFileSync(join(ROOT, rel), 'utf8'))
    checks['identifier read judged'] += 1
    for (const envVar of envVars) {
      if (!source.includes(`process.env.${envVar}`)) continue
      faults.push(
        rel.startsWith('scripts/')
          ? `${rel} reads process.env.${envVar}. A NEXT_PUBLIC value reaches a browser because the SERVER inlined it, so a script reading its own environment is answering a question about a different machine: it can report a pass having tested nothing, and it can fail a platform that is working. Observe the gate's own script elements in the browser instead (scripts/verify/lib/an1-accepted-loads.mjs)`
          : `${rel} reads process.env.${envVar} outside the gate. A provider identifier is read in one place, because a second reader is the one that will load a tracker without asking mayLoad`,
      )
    }
  }
}

/* ------- 7. the drive's judgement and the gate name the same script elements */

/**
 * The drive learns what the server gave the browser by looking for the gate's
 * script elements by id. If the gate renames one and the judgement does not
 * follow, the drive looks for an element that no longer exists, finds nothing,
 * and reports "the gate rendered no provider script" for ever: a verification
 * that has silently stopped verifying, which is the exact failure clause 6
 * exists for, arriving by a different door.
 */
const JUDGEMENT_FILE = 'scripts/verify/lib/an1-accepted-loads.mjs'
const judgement = read(JUDGEMENT_FILE)
if (judgement && gate) {
  const judged = [...judgement.matchAll(/id:\s*'(el-[a-z0-9-]+)'/g)].map(m => m[1])
  const rendered = [...gate.matchAll(/id="(el-[a-z0-9-]+)"/g)].map(m => m[1])
  if (judged.length === 0) {
    faults.push(
      `${JUDGEMENT_FILE} names no gate script element, so the drive would look for nothing and find nothing, and call that an unconfigured platform`,
    )
  }
  for (const id of rendered) {
    checks['gate script element judged'] += 1
    if (!judged.includes(id)) {
      faults.push(
        `${GATE_FILE} renders a script element with id ${id} and ${JUDGEMENT_FILE} does not name it. The drive refuses an element it cannot judge, so this fails loudly there; it is named here so it fails at build time instead`,
      )
    }
  }
  for (const id of judged) {
    if (!rendered.includes(id)) {
      faults.push(
        `${JUDGEMENT_FILE} judges a script element ${id} that ${GATE_FILE} no longer renders. The drive will never see it, and a judgement watching for something that cannot appear is a check that has stopped checking`,
      )
    }
  }
}

/* --------------------------------------------- 4. the default is refusal */

const consent = read(CONSENT_FILE)
if (consent) {
  checks['gate property asserted'] += 1
  const noConsent = consent.match(/export const NO_CONSENT[\s\S]*?\n\}/)
  if (!noConsent || /:\s*true/.test(noConsent[0])) {
    faults.push(
      `${CONSENT_FILE} NO_CONSENT grants a category. It is what every reader sees on a first visit, on a crawler, and on any value the decoder cannot parse, so it must grant nothing`,
    )
  }
  checks['gate property asserted'] += 1
  const decoder = consent.slice(consent.indexOf('export function decodeConsent'))
  const returnsNoConsent = [...decoder.matchAll(/return NO_CONSENT/g)].length
  if (returnsNoConsent < 3) {
    faults.push(
      `${CONSENT_FILE} decodeConsent has ${returnsNoConsent} path(s) returning NO_CONSENT. A cookie is user-writable and arrives from a public browser: a missing value, a malformed one, a non-object and a stale version must all answer "they have not agreed"`,
    )
  }
  checks['gate property asserted'] += 1
  if (!/if \(!input\.decision\[input\.category\]\) return false/.test(consent)) {
    faults.push(`${CONSENT_FILE} mayLoad no longer refuses when the category is not granted`)
  }
}

/* ------------------------------------------------------------------ verdict */

declareWork('no-analytics-before-consent', {
  did: { ...checks, 'provider host enumerated': hosts.length },
  found: { 'ungated path to a tracker': faults.length },
})

console.log(`${TAG} registry: ${envVars.length} provider(s), ${hosts.length} host(s); ${HOST_ALLOWED.length} file(s) allowed to name one:`)
for (const entry of HOST_ALLOWED) console.log(`${TAG}   ${entry.path}  ${entry.why}`)
console.log(`${TAG} ${IDENTIFIER_READ_ALLOWED.length} file(s) allowed to READ an identifier, and nothing under scripts/ is:`)
for (const entry of IDENTIFIER_READ_ALLOWED) console.log(`${TAG}   ${entry.path}  ${entry.why}`)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} way(s) a tracker could load for somebody who said no.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - every provider is behind the consent gate, and the default is refusal.`)
