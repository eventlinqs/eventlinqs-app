/**
 * WHAT SPEED IS THIS MACHINE RUNNING AT, RIGHT NOW.
 *
 * WHY THIS EXISTS. On 8 September 2026 the local gate refused a push on the
 * positioning branch. The floors it refused against had been set that same day
 * from THREE local collections that agreed within 1 point per URL. Re-run on the
 * same tree it refused again, and then MAIN'S OWN TREE, the commit that had
 * measured 88 to 94 three times, came back at 79 to 92 and failed the same
 * floors.
 *
 * The script bytes were identical to the byte on every URL. Total Blocking Time
 * had roughly DOUBLED on every URL:
 *
 *   /                 103 ms -> 191 ms      /organisers       104 ms -> 258 ms
 *   /community/african  69 ms -> 239 ms     /pricing           81 ms -> 159 ms
 *   /events             74 ms -> 211 ms     /events/cat-indie 114 ms -> 311 ms
 *
 * Same bytes, twice the main-thread time. That is the machine, not the product,
 * and the gate had no way to say so: it reports what the page cost and never
 * what the machine was capable of, so a slow afternoon and a real regression
 * arrive in the log looking exactly alike.
 *
 * WHAT IT MEASURES. Lighthouse's own BenchmarkIndex, lifted unchanged from
 * node_modules/lighthouse/core/lib/page-functions.js (lighthouse 13.4.1), which
 * documents the scale in its own header:
 *
 *   1000+ is a desktop-class device, Core i3 PC, iPhone X, etc
 *    800+ is a high-end Android phone, Galaxy S8, low-end Chromebook, etc
 *    125+ is a mid-tier Android phone, Moto G4, etc
 *   < 125 is a budget Android phone, Alcatel Ideal, Galaxy J2, etc
 *
 * Lighthouse records this number in every report at environment.benchmarkIndex
 * and uses it to decide how much to throttle, so it is the number that decides
 * whether a local score is comparable to yesterday's.
 *
 * WHAT IT IS NOT. This runs in node's V8, not in the headless Chrome Lighthouse
 * launches, so it is not the same instrument reading. Both are V8 running the
 * same two loops on the same silicon, so it tracks the machine; treat the
 * MOVEMENT as the signal and the absolute value as approximate. The exact
 * reading for a collection is in each report's environment.benchmarkIndex, and
 * scripts/ci/lighthouse-truth-table.mjs now prints it.
 *
 * Run:  node scripts/perf/machine-speed.mjs [samples]
 */
import { declareWork } from '../lib/work-report.mjs'

/**
 * Lighthouse's GC-heavy half: build a 10,000 character string in a loop for
 * 500 ms and report iterations per second divided by ten.
 */
function benchmarkIndexGC() {
  const start = Date.now()
  let iterations = 0
  while (Date.now() - start < 500) {
    let s = ''
    for (let j = 0; j < 10000; j++) s += 'a'
    if (s.length === 1) throw new Error('will never happen, but prevents compiler optimizations')
    iterations++
  }
  const durationInSeconds = (Date.now() - start) / 1000
  return Math.round(iterations / 10 / durationInSeconds)
}

/**
 * Lighthouse's non-GC half: copy 100,000 integers between two arrays. The
 * iteration count is checked only every tenth pass, which is Lighthouse's own
 * workaround for an Intel JCC alignment cliff.
 */
function benchmarkIndexNoGC() {
  const arrA = []
  const arrB = []
  for (let i = 0; i < 100000; i++) arrA[i] = arrB[i] = i
  const start = Date.now()
  let iterations = 0
  while (iterations % 10 !== 0 || Date.now() - start < 500) {
    const src = iterations % 2 === 0 ? arrA : arrB
    const tgt = iterations % 2 === 0 ? arrB : arrA
    for (let j = 0; j < src.length; j++) tgt[j] = src[j]
    iterations++
  }
  const durationInSeconds = (Date.now() - start) / 1000
  return Math.round(iterations / 10 / durationInSeconds)
}

export function benchmarkIndex() {
  return (benchmarkIndexGC() + benchmarkIndexNoGC()) / 2
}

/** Lighthouse's own device classes, from the header of the function above. */
export function deviceClass(index) {
  if (index >= 1000) return 'desktop class (Core i3 PC, iPhone X)'
  if (index >= 800) return 'high-end Android (Galaxy S8, low-end Chromebook)'
  if (index >= 125) return 'mid-tier Android (Moto G4)'
  return 'budget Android (Alcatel Ideal, Galaxy J2)'
}

const samples = Math.max(1, Number(process.argv[2] || 5))
const readings = []
for (let i = 0; i < samples; i++) readings.push(benchmarkIndex())
readings.sort((a, b) => a - b)
const mid = readings[Math.floor((readings.length - 1) / 2)]

console.log(`[machine-speed] Lighthouse BenchmarkIndex, ${samples} sample(s) in node`)
console.log(`[machine-speed]   median ${Math.round(mid)}   range ${Math.round(readings[0])} to ${Math.round(readings[readings.length - 1])}`)
console.log(`[machine-speed]   ${deviceClass(mid)}`)
console.log('[machine-speed] Scale from node_modules/lighthouse/core/lib/page-functions.js (lighthouse 13.4.1).')
declareWork('machine-speed', { did: { 'benchmark sample taken': readings.length } })
