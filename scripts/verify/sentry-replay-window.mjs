// MEASURE THE SESSION REPLAY NO-BUFFER WINDOW, AND PROVE THE RECORDER COSTS
// NOTHING BEFORE THE FIRST INTERACTION.
//
// Session Replay runs in BUFFER mode (replaysSessionSampleRate 0,
// replaysOnErrorSampleRate 1.0): it keeps a rolling ring of DOM events so that
// when an error fires it can upload what led up to it. That ring only exists
// once the recorder is armed. Any error before arming is still CAPTURED, but
// carries no replay.
//
// PR #108 deferred Replay to load + requestIdleCallback and accepted that
// window. Close-out P0.5 (8 September 2026) moved it again, to the visitor's
// FIRST INTERACTION, because an idle callback fires during the quiet a
// throttled device has while the hero is still painting: measured at 123.2 KB
// and 413 ms of evaluation landing inside the Largest Contentful Paint window
// on the event page the launch gate audits.
//
// So this script now answers two questions rather than one, and the first is
// the law:
//
//   1. BEFORE any interaction, does the recorder chunk arrive at all? It must
//      not. That is the whole of "costs nothing before first interaction", and
//      it is checked by observing the network rather than by reading the source.
//   2. AFTER a real interaction, how long until the recorder is armed? That is
//      the no-buffer window, and it is a number rather than an adjective.
//
// METHOD, IDENTICAL ON BOTH SIDES so a before/after comparison is honest:
//   - drive a real Chromium at a real URL
//   - watch the network for the chunk that carries the Replay recorder,
//     identified by fetching each script body once and testing for rrweb's own
//     marker strings rather than by guessing a filename
//   - wait past the SDK's own post-load timer with NO input, and record what
//     arrived
//   - then perform a REAL pointer input (page.mouse, not dispatchEvent, so the
//     browser treats it as a genuine user gesture) and record what arrives after
//
// Network timing is used rather than an in-page performance mark because the
// BASELINE build has no mark to read. Measuring one side with a mark and the
// other with the network would not be a comparison.
//
// Usage:
//   node scripts/verify/sentry-replay-window.mjs <url> [runs]

import { chromium } from 'playwright'

const url = process.argv[2]
const runs = Number(process.argv[3] || 3)
if (!url) {
  console.error('usage: node scripts/verify/sentry-replay-window.mjs <url> [runs]')
  process.exit(1)
}

// Strings that appear ONLY in the chunk carrying the rrweb recorder.
//
// 'replayIntegration' was tried first and is WRONG: it is exported from the SDK
// barrel, so it also appears in the core chunk, and using it measured the core
// chunk's arrival as if it were the recorder's. That produced a "replay armed at
// 518ms" reading on a build whose recorder cannot arm before the load event at
// 621ms, which is how the mistake surfaced. 'takeFullSnapshot' is rrweb's own
// entry point and appears in exactly one chunk. Verified with:
//   grep -rl <marker> .next/static/chunks/*.js | wc -l
const REPLAY_MARKERS = ['takeFullSnapshot']
// Strings that identify a chunk carrying Sentry SDK code. Present in both the
// core chunk and the recorder chunk, so the FIRST arrival is the core.
const SDK_MARKERS = ['__SENTRY_DEBUG__']

/**
 * How long to sit on the page doing nothing before deciding the recorder has
 * not arrived.
 *
 * Generously past instrumentation-client.ts's BOOT_AFTER_LOAD_MS of 3,000 ms,
 * so this window contains the SDK core's own scheduled arrival. If the recorder
 * were still on a timer or an idle callback it would land inside this window,
 * which is what makes the "not seen" reading mean something.
 */
const QUIET_MS = 9000

/** How long to wait after the interaction for the recorder to arrive. */
const AFTER_INTERACTION_MS = 6000

const results = []

for (let run = 1; run <= runs; run++) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const context = await browser.newContext({
    // Match the audited profile the Lighthouse gate uses.
    extraHTTPHeaders: { Cookie: 'el-audit=1' },
  })
  const page = await context.newPage()

  const scripts = []
  page.on('response', async (res) => {
    const u = res.url()
    if (!/\.js(\?|$)/.test(u)) return
    scripts.push({ url: u, at: Date.now(), response: res })
  })

  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  const loadAt = Date.now() - t0

  await page.waitForTimeout(QUIET_MS)
  const quietUntil = Date.now()

  // A REAL input. page.mouse dispatches through the browser's input pipeline,
  // so the listeners see a trusted event exactly as they would from a finger.
  // A dispatchEvent would be untrusted and would prove nothing about a visitor.
  await page.mouse.move(200, 400)
  await page.mouse.down()
  await page.mouse.up()
  const interactionAt = Date.now()
  await page.waitForTimeout(AFTER_INTERACTION_MS)

  let replayAt = null
  let sdkAt = null
  let replayBeforeInteraction = false
  for (const s of scripts) {
    let body = ''
    try {
      body = await s.response.text()
    } catch (error) {
      // A body that cannot be read is a chunk this script cannot classify, and
      // an unclassified chunk could be the recorder. Say so: a silent skip here
      // would turn a missed detection into a clean bill of health.
      console.warn(`  run ${run}: could not read ${s.url.slice(-28)}: ${error.message}`)
      continue
    }
    const rel = s.at - t0
    if (REPLAY_MARKERS.some((m) => body.includes(m))) {
      if (replayAt === null || rel < replayAt) replayAt = rel
      if (s.at <= quietUntil) replayBeforeInteraction = true
    }
    if (SDK_MARKERS.some((m) => body.includes(m))) {
      if (sdkAt === null || rel < sdkAt) sdkAt = rel
    }
  }

  // The in-page mark, when the build emits one. Reported alongside the network
  // number rather than instead of it, so both sides stay comparable.
  const mark = await page.evaluate(() => {
    try {
      const e = performance.getEntriesByName('el:sentry-replay-armed')
      return e.length ? Math.round(e[0].startTime) : null
    } catch {
      return null
    }
  })

  results.push({
    run,
    loadAt,
    sdkAt,
    replayAt,
    mark,
    replayBeforeInteraction,
    sinceInteraction: replayAt === null ? null : t0 + replayAt - interactionAt,
  })
  console.log(
    `  run ${run}: load ${loadAt}ms | sdk chunk ${sdkAt ?? 'not seen'}ms | ` +
      `replay chunk ${replayAt ?? 'not seen'}ms | before any input: ${replayBeforeInteraction ? 'YES' : 'no'} | ` +
      `mark ${mark ?? 'none'}`,
  )

  await browser.close()
}

const med = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)
}

const leaked = results.filter((r) => r.replayBeforeInteraction).length

console.log('\nMEDIAN')
console.log(`  window load                    ${med(results.map((r) => r.loadAt))} ms`)
console.log(`  Sentry SDK chunk               ${med(results.map((r) => r.sdkAt))} ms`)
console.log(`  Replay chunk (from navigation) ${med(results.map((r) => r.replayAt))} ms`)
console.log(`  Replay chunk (from the input)  ${med(results.map((r) => r.sinceInteraction))} ms   <-- the no-buffer window`)
console.log(`  in-page mark                   ${med(results.map((r) => r.mark))} ms`)
console.log('')
if (leaked > 0) {
  console.error(
    `FAILED: the Replay recorder arrived with no input on ${leaked} of ${runs} run(s), after ${QUIET_MS} ms of doing nothing.`,
  )
  console.error('close-out P0.5: the recorder must cost nothing before the first interaction.')
  process.exitCode = 1
} else {
  console.log(
    `PASS: on ${runs} of ${runs} run(s) the Replay recorder was not requested at all during ${QUIET_MS} ms of no input,`,
  )
  console.log('and arrived only after a real pointer input. It costs nothing before the first interaction.')
}
console.log(`\n${url}`)
