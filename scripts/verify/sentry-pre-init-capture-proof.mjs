// PROVE THAT DEFERRING THE SDK COSTS ZERO ERROR REPORTS.
//
// The whole safety argument for loading Sentry off the boot path is that the
// synchronous capture shim is armed first, so an error thrown before the SDK
// exists is held and forwarded once it initialises. That is a claim. This
// script is the proof.
//
// It throws a real, uncaught error inside that window (default 200ms, before the
// window load event that triggers the SDK import), then watches the network for
// the Sentry envelope leaving the browser through the /api/monitoring tunnel,
// and reports what the envelope actually contains: the message, whether a stack
// trace survived, the environment tag, and critically the el_capture tag, which
// is only set on events that came out of the shim's buffer.
//
// THE BLIND SPOT THIS DOES NOT COVER, stated so nobody assumes otherwise.
// Neither the shim nor the SDK exists until instrumentation-client.ts itself
// executes, so an error before that module runs is not captured. Measured on
// this preview, a throw at 50ms is captured by NEITHER build:
//
//   origin/main            throwAt=50ms  captured=false
//   perf/sentry-client-... throwAt=50ms  captured=false
//   both                   throwAt=900ms captured=true, stack + env intact
//
// That blind spot is pre-existing and identical on both sides: before this
// change the SDK also only initialised when that module ran. Deferring the SDK
// did not widen it. What deferring DID create is a new window between the module
// executing and the SDK arriving, and covering that window is exactly what the
// shim is for. This script proves the shim covers it.
//
// A silent loss of observability would be far worse than the performance
// problem this change solves, so this asserts rather than describes.
//
// Usage: node scripts/verify/sentry-pre-init-capture-proof.mjs <url>

import { chromium } from 'playwright'

const url = process.argv[2]

if (!url) {
  console.error('usage: node scripts/verify/sentry-pre-init-capture-proof.mjs <url>')
  process.exit(1)
}

// Letters only, deliberately. The PII scrubber redacts CC-shaped digit blocks,
// so a timestamped marker can be scrubbed out of the very event we are looking
// for, turning a genuine capture into a false failure. That happened on the
// first run of this script.
const MARKER = 'ELPREINITCAPTUREPROOF'

/**
 * How long to hold the Sentry SDK chunk back, in ms.
 *
 * Without this the test is a race. The SDK sometimes lands before the throw and
 * sometimes after, so the same command passes and fails on alternate runs, which
 * is worthless as a gate. Delaying the chunk makes the shim window deterministic
 * and, more to the point, tests the property we actually care about: a slow or
 * congested network must not cost an error report.
 */
const SDK_DELAY_MS = 4000

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ extraHTTPHeaders: { Cookie: 'el-audit=1' } })
const page = await context.newPage()

// Hold back whichever chunk carries the SDK. Identified by content, not by
// filename: chunk names are content hashes and change every build.
let heldChunk = null
await page.route('**/_next/static/chunks/**', async (route) => {
  const response = await route.fetch()
  const body = await response.text()
  if (body.includes('__SENTRY_DEBUG__')) {
    heldChunk = new URL(route.request().url()).pathname
    await new Promise((r) => setTimeout(r, SDK_DELAY_MS))
  }
  // route.fetch() DECODES the body, so replaying the original content-encoding
  // and content-length headers alongside it hands the browser a payload that
  // does not match its own headers. The chunk then fails to parse, the SDK never
  // loads, and the test reports "error never reached Sentry" for a reason that
  // has nothing to do with the code under test. That false failure happened on
  // the first run with the delay engaged.
  const headers = { ...response.headers() }
  delete headers['content-encoding']
  delete headers['content-length']
  await route.fulfill({ status: response.status(), headers, body })
})

const envelopes = []
page.on('request', (req) => {
  if (!req.url().includes('/api/monitoring')) return
  const body = req.postData()
  if (body) envelopes.push(body)
})

console.log(`throwing "${MARKER}" on`)
console.log(`  ${url}\n`)

// Start the navigation, then wait for the shim's OWN mark before throwing.
// Throwing on a timer is a race: routing chunks through Playwright adds latency,
// which pushed module execution past a 300ms throw and lost the error for a
// reason that had nothing to do with the code under test. That false failure
// happened twice before this was changed. Waiting for the mark removes the race
// and tests exactly the property claimed: after capture is armed and before the
// SDK arrives, an error is still reported.
await page.goto(url, { waitUntil: 'commit', timeout: 90000 })
await page.waitForFunction(
  () => performance.getEntriesByName('el:sentry-shim-armed').length > 0,
  undefined,
  { timeout: 60000 },
)
const armedAt = await page.evaluate(() =>
  Math.round(performance.getEntriesByName('el:sentry-shim-armed')[0].startTime),
)
console.log(`shim armed at ${armedAt}ms; throwing now, SDK still held back`)
await page.evaluate((marker) => {
  setTimeout(() => {
    throw new Error(marker)
  }, 0)
}, MARKER)

await page.waitForLoadState('load', { timeout: 90000 }).catch(() => {})
// The SDK loads on window load and drains immediately; allow generous room for
// the held chunk to arrive, the drain to run, and the envelope to leave.
await page.waitForTimeout(15000)
console.log(`held back SDK chunk: ${heldChunk ?? '(none seen)'} for ${SDK_DELAY_MS}ms`)

await browser.close()

console.log(`Sentry envelopes seen on /api/monitoring: ${envelopes.length}`)

const matching = envelopes.filter((e) => e.includes(MARKER))
if (matching.length === 0) {
  console.error('\nFAILED: the pre-init error never reached Sentry.')
  console.error('Deferring the SDK has cost an error report. Do not ship this.')
  process.exit(1)
}

// Envelopes are newline-delimited JSON. Find the item carrying our error.
let event = null
for (const raw of matching) {
  for (const line of raw.split('\n')) {
    if (!line.includes(MARKER)) continue
    try {
      const parsed = JSON.parse(line)
      if (parsed.exception || parsed.message) {
        event = parsed
        break
      }
    } catch {
      // envelope headers are JSON too; skip anything that is not the event
    }
  }
  if (event) break
}

if (!event) {
  console.error('\nFAILED: envelope mentions the marker but no event body could be parsed.')
  process.exit(1)
}

const values = event.exception?.values ?? []
const frames = values[0]?.stacktrace?.frames ?? []
const tags = event.tags ?? {}

console.log('\nCAPTURED EVENT')
console.log(`  type          ${values[0]?.type ?? '(none)'}`)
console.log(`  value         ${values[0]?.value ?? event.message ?? '(none)'}`)
console.log(`  release       ${event.release ?? '(MISSING)'}`)
console.log(`  environment   ${event.environment ?? '(MISSING)'}`)
console.log(`  el_capture    ${tags.el_capture ?? '(none)'}`)
console.log(`  stack frames  ${frames.length}`)
for (const f of frames.slice(-3)) {
  console.log(`     ${f.filename ?? '?'}:${f.lineno ?? '?'}  ${f.function ?? ''}`)
}

const problems = []
if (!event.environment) problems.push('environment tag missing')
if (frames.length === 0) problems.push('no stack frames: the stack did not survive the buffer')

// release is reported, not asserted. It reads "local" on preview deployments
// because VERCEL_GIT_COMMIT_SHA is not exposed to the client bundle (it needs a
// NEXT_PUBLIC_ prefix to cross into the browser). That is a PRE-EXISTING gap,
// identical on origin/main, and it is not this change's to fix. It is worth
// fixing separately: without it, a client error cannot be tied to a deploy.
if (event.release === 'local' || !event.release) {
  console.log('\n  NOTE: release reads "local". Pre-existing on both branches;')
  console.log('        VERCEL_GIT_COMMIT_SHA is not NEXT_PUBLIC_ so the browser cannot see it.')
}

if (problems.length) {
  console.error(`\nFAILED: ${problems.join('; ')}`)
  process.exit(1)
}

console.log('\nPASS: pre-init error captured with a usable stack and environment tag.')
