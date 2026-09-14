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
const checks = { 'source file swept': 0, 'provider judged': 0, 'gate property asserted': 0 }

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

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} way(s) a tracker could load for somebody who said no.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - every provider is behind the consent gate, and the default is refusal.`)
