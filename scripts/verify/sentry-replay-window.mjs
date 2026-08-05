// MEASURE THE SESSION REPLAY NO-BUFFER WINDOW.
//
// Session Replay runs in BUFFER mode (replaysSessionSampleRate 0,
// replaysOnErrorSampleRate 1.0): it keeps a rolling ring of DOM events so that
// when an error fires it can upload what led up to it. That ring only exists
// once the recorder is armed. Any error before arming is still CAPTURED, but
// carries no replay.
//
// PR #108 deferred Replay to load + requestIdleCallback and accepted that
// window. Deferring the SDK itself moves it further out. "Further" is a number,
// not an adjective, so this script measures it.
//
// METHOD, IDENTICAL ON BOTH SIDES so a before/after comparison is honest:
//   - drive a real Chromium at a real URL
//   - watch the network for the chunk that carries the Replay recorder,
//     identified by fetching each script body once and testing for rrweb's own
//     marker strings rather than by guessing a filename
//   - report responseEnd of that chunk, relative to navigation start
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

  // Give the idle callback room to fire. The arming path is load ->
  // requestIdleCallback(timeout 5000), so anything under ~8s is in scope.
  await page.waitForTimeout(12000)

  let replayAt = null
  let sdkAt = null
  for (const s of scripts) {
    let body = ''
    try {
      body = await s.response.text()
    } catch {
      continue
    }
    const rel = s.at - t0
    if (REPLAY_MARKERS.some((m) => body.includes(m))) {
      if (replayAt === null || rel < replayAt) replayAt = rel
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

  results.push({ run, loadAt, sdkAt, replayAt, mark })
  console.log(
    `  run ${run}: load ${loadAt}ms | sdk chunk ${sdkAt ?? 'not seen'}ms | ` +
      `replay chunk ${replayAt ?? 'not seen'}ms | mark ${mark ?? 'none'}`,
  )

  await browser.close()
}

const med = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)
}

console.log('\nMEDIAN')
console.log(`  window load        ${med(results.map((r) => r.loadAt))} ms`)
console.log(`  Sentry SDK chunk   ${med(results.map((r) => r.sdkAt))} ms`)
console.log(`  Replay chunk       ${med(results.map((r) => r.replayAt))} ms   <-- the no-buffer window`)
console.log(`  in-page mark       ${med(results.map((r) => r.mark))} ms`)
console.log(`\n${url}`)
