/**
 * IS THIS MACHINE FIT TO JUDGE THE FLOORS RIGHT NOW.
 *
 * ============================================================================
 * WHY THIS EXISTS, and it cost a session to learn
 * ============================================================================
 *
 * On 8 September 2026 the per-URL performance floors in lighthouserc.json were
 * raised from a flat 0.80 to 0.85 through 0.91, derived from local collections
 * that measured 88 to 94. Hours later, on the same laptop, the same gate refused
 * MAIN'S OWN TREE against those floors: event pages 79 to 84, /organisers 86 to
 * 88, /community/african 84 to 86. Script bytes were identical to the byte and
 * Total Blocking Time had roughly doubled on every URL.
 *
 * That was read as "the floors are unholdable on the local instrument", and the
 * owner was asked to choose between lowering them and deleting a piece of the
 * product. BOTH CONCLUSIONS WERE WRONG, and the reason they were wrong is that
 * nothing in the gate's output said what the machine was doing.
 *
 * Re-measured on 9 September 2026, same tree, same settings, same Lighthouse
 * 12.6.1, median of five (C:\dev\EVIDENCE\P0.7-D):
 *
 *   URL                          local server   Vercel preview   floor
 *   /                                  92             91          0.88
 *   /events/cat-indie-sounds-...       87             94          0.85
 *   /community/african                 92             96          0.88
 *
 * Every URL cleared its floor, on both targets, with the SAME code that had been
 * refused the evening before. The one thing that had changed was the machine:
 * BenchmarkIndex 2665 to 2755 on the passing day against 1113 to 1993 on the
 * refusing one.
 *
 * ============================================================================
 * WHAT THIS MODULE DOES, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================================
 *
 * IT DOES NOT CHANGE A VERDICT. A failed assertion still fails and still blocks
 * the push, at exactly the same exit code. Nothing here can let a slow page
 * through, because a gate that excuses a failure is not a gate, and the rule
 * that the floor only ever rises (close-out P0.7, H5, C16.5) covers the message
 * as well as the number.
 *
 * WHAT IT CHANGES IS THE DIAGNOSIS. A red Lighthouse step used to say only that
 * the page was too slow, which sends the reader to the product or to the floor.
 * When the collection was taken on a machine far below the one the floors were
 * derived on, that reading is not available from the numbers and the reader
 * cannot know it. This says so, in the failure, with the measurement.
 *
 * ============================================================================
 * WHY BenchmarkIndex AND NOT SOMETHING ELSE
 * ============================================================================
 *
 * Lighthouse computes it itself, in the audited browser, immediately before
 * every run, and records it at environment.benchmarkIndex. It is not a proxy
 * this repository invented: it is the number Lighthouse uses to decide how hard
 * to throttle, and its own scale is quoted in scripts/ci/lighthouse-truth-table.mjs.
 * So it is measured by the same instrument, in the same process, at the same
 * moment as the score it qualifies.
 *
 * ============================================================================
 * WHY ONE MEDIAN ACROSS THE WHOLE COLLECTION WAS NOT ENOUGH (13 September 2026)
 * ============================================================================
 *
 * The first version of this module judged the MEDIAN of all 65 readings against
 * the floor and nothing else. On 13 September, the day the build went to three
 * parallel lanes on one laptop, that produced a sentence that was flatly false:
 *
 *     Machine calibration: OK. BenchmarkIndex median 2379 (1071 to 2707), 88%
 *     of the 2700 the floors were confirmed at on 2026-09-09.
 *     This machine was fit to judge, so a failure above is a statement about the
 *     product and not about the laptop.
 *
 * It was not a statement about the product. Three URLs were under their floors,
 * and NOT ONE PRODUCT BYTE had changed since the tip whose own local gate had
 * passed the same step four hours earlier: the only diff between the two trees
 * was four drive scripts, two libraries and one unit test, none of them in the
 * build. What had changed was the machine, from one claude session to three plus
 * their dev servers, and the spread says it plainly. 1071 is BELOW 1113, the
 * bottom of the very band this module cites as the evening that refused main's
 * own tree.
 *
 * THE ARITHMETIC THAT HID IT. A category floor is asserted on the median of ONE
 * URL'S FIVE RUNS. A median across all 65 runs can sit comfortably above the
 * floor while one URL's own five were every one of the starved ones, which is
 * exactly what happened: /events/arena-sessions-large-room-performance-test came
 * back 0.68, 0.69, 0.71, 0.76, 0.65, a tight band 16 points under its floor,
 * which is not noise, it is a slower machine for those five runs.
 *
 * So the judgement is now made where the assertion is made: PER URL, on that
 * URL's own runs. A URL whose own median reading is under the floor was not
 * measured on a comparable instrument and its failure is not evidence about the
 * product. A URL measured above the floor still fails as a statement about the
 * product, which is the half that must never soften.
 */

/**
 * THE READING THE FLOORS WERE DERIVED ON, and how it was taken.
 *
 * This is a CLAIM ABOUT A MEASUREMENT and it carries its date, its method and
 * its evidence path so a reader can judge how fresh it is instead of trusting
 * it, the same contract the support horizon in
 * scripts/guards/no-deprecated-runtime.mjs holds itself to.
 *
 * `derivedAt` is the observed band across the 30 audits taken on 9 September
 * 2026 that confirmed the floors hold: 15 against a locally served production
 * build and 15 against the Vercel preview CI had measured that morning. It is
 * NOT lifted from the 8 September collections the floors were actually derived
 * from, because the truth table did not print BenchmarkIndex until 9 September
 * and inventing a number for those runs would be exactly the guess this file
 * exists to replace. The 9 September collections reproduce the 8 September
 * medians to within a point per URL, which is why they stand in for them.
 */
export const CALIBRATION = {
  /** Median BenchmarkIndex across the collections that confirmed the floors hold. */
  derivedAt: 2700,
  /** The observed spread of that band, printed so the single number is not read as precision. */
  derivedRange: [2665, 2755],
  /**
   * Below this, a collection is not comparable with the ones the floors came
   * from. It is the TOP of the band observed on the refusing evening (1113 to
   * 1993), rounded up, so every one of those collections falls under it and the
   * confirming band clears it by 700.
   */
  floor: 2000,
  measuredOn: '2026-09-09',
  evidence: 'C:\\dev\\EVIDENCE\\P0.7-D',
}

/**
 * The median of a numeric list, lower-middle on an even count, matching the
 * aggregation lighthouserc.json pins for every category floor.
 *
 * @param {number[]} values
 * @returns {number | null}
 */
function median(values) {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (clean.length === 0) return null
  return clean[Math.floor((clean.length - 1) / 2)]
}

/** The URL a report was taken against, however that report happens to name it. */
function urlOf(lhr) {
  const named = lhr?.finalDisplayedUrl ?? lhr?.finalUrl ?? lhr?.requestedUrl
  return typeof named === 'string' && named.length > 0 ? named : null
}

/**
 * Every URL in a collection with the machine ITS OWN runs were taken on.
 *
 * This is the unit the floors are actually asserted on: lighthouserc.json
 * aggregates a category score as the median of one URL's runs, so the machine
 * reading that qualifies that score is the median of those same runs and not of
 * the collection. See the 13 September note in this file's header for the
 * collection where the two disagreed and the disagreement was the whole answer.
 *
 * @param {Array<{ finalDisplayedUrl?: string, finalUrl?: string, requestedUrl?: string,
 *                 environment?: { benchmarkIndex?: number } }> | undefined} lhrs
 *   Tolerates undefined on purpose: it runs on the FAILURE path, where a reader
 *   came for the failure and not for a crash in the diagnosis.
 * @returns {Array<{ url: string, runs: number, median: number, low: number, high: number, fit: boolean }>}
 *   Sorted slowest median first, so the URLs whose failures are least trustworthy
 *   as product statements are read first.
 */
export function perUrlBands(lhrs) {
  /** @type {Map<string, number[]>} */
  const byUrl = new Map()
  for (const lhr of lhrs ?? []) {
    const url = urlOf(lhr)
    const reading = lhr?.environment?.benchmarkIndex
    if (url == null || typeof reading !== 'number' || !Number.isFinite(reading)) continue
    if (!byUrl.has(url)) byUrl.set(url, [])
    byUrl.get(url).push(reading)
  }
  const rows = []
  for (const [url, readings] of byUrl) {
    const mid = median(readings)
    if (mid == null) continue
    rows.push({
      url,
      runs: readings.length,
      median: Math.round(mid),
      low: Math.round(Math.min(...readings)),
      high: Math.round(Math.max(...readings)),
      fit: mid >= CALIBRATION.floor,
    })
  }
  return rows.sort((a, b) => a.median - b.median)
}

/**
 * The per-URL block, printed under the whole-collection verdict.
 *
 * It names the instrument for each URL and says which of them were not fit to
 * judge. It CANNOT change a verdict and deliberately holds no field a caller
 * could read as permission: it returns lines.
 *
 * @param {Parameters<typeof perUrlBands>[0]} lhrs
 * @returns {string[]}
 */
export function perUrlLines(lhrs) {
  const rows = perUrlBands(lhrs)
  if (rows.length === 0) return []
  const unfit = rows.filter((r) => !r.fit)
  const lines = [
    '',
    `The machine each URL's own runs were taken on, because that is the unit the`,
    `floors are asserted on (median of that URL's runs, floor ${CALIBRATION.floor}):`,
  ]
  for (const row of rows) {
    lines.push(
      `  ${row.fit ? 'fit    ' : 'NOT FIT'}  median ${String(row.median).padStart(5)}  ` +
        `(${row.low} to ${row.high}, ${row.runs} run${row.runs === 1 ? '' : 's'})  ${row.url}`,
    )
  }
  if (unfit.length > 0) {
    lines.push(
      '',
      `${unfit.length} of ${rows.length} URL(s) were measured BELOW the floor. A failure on one of`,
      'those is not evidence about the product: re-take it on a quiet machine before',
      'reading it as a regression. A failure on a URL marked fit IS about the product.',
      'Either way nothing was excused and nothing was pushed.',
    )
  }
  return lines
}

/**
 * Read every BenchmarkIndex out of a set of Lighthouse reports.
 *
 * @param {Array<{ environment?: { benchmarkIndex?: number } }>} lhrs
 * @returns {number[]}
 */
export function benchmarkIndexes(lhrs) {
  return lhrs
    .map((l) => l?.environment?.benchmarkIndex)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
}

/**
 * Judge whether a collection was taken on an instrument comparable with the one
 * the floors were derived on.
 *
 * @param {number[]} indexes every run's BenchmarkIndex, in any order.
 * @returns {{ state: 'calibrated' | 'mixed' | 'degraded' | 'unknown', median: number | null,
 *             low: number | null, high: number | null, ratio: number | null,
 *             belowFloor: number, runs: number, lines: string[] }}
 *   `state` is the finding: `calibrated` when every run cleared the floor,
 *   `mixed` when the median did and at least one run did not, `degraded` when
 *   the median did not. `lines` is what a reader needs to see and is written
 *   to be pasted into a report unchanged. There is deliberately no field a
 *   caller could read as permission to pass.
 */
export function judgeCalibration(indexes) {
  const mid = median(indexes)
  if (mid == null) {
    return {
      state: 'unknown',
      median: null,
      low: null,
      high: null,
      ratio: null,
      belowFloor: 0,
      runs: 0,
      lines: [
        'Machine calibration: NOT KNOWN. No report in this collection carries',
        'environment.benchmarkIndex, so whether this laptop was fit to judge the',
        'floors cannot be said either way. Treat the scores above with that in mind.',
      ],
    }
  }
  const low = Math.min(...indexes)
  const high = Math.max(...indexes)
  const ratio = mid / CALIBRATION.derivedAt
  const pct = Math.round(ratio * 100)
  const band = `${Math.round(low)} to ${Math.round(high)}`
  const belowFloor = indexes.filter((v) => v < CALIBRATION.floor).length
  const runs = indexes.length
  if (mid >= CALIBRATION.floor && belowFloor === 0) {
    return {
      state: 'calibrated',
      median: mid,
      low,
      high,
      ratio,
      belowFloor,
      runs,
      lines: [
        `Machine calibration: OK. BenchmarkIndex median ${Math.round(mid)} (${band}), ` +
          `${pct}% of the ${CALIBRATION.derivedAt} the floors were confirmed at ` +
          `on ${CALIBRATION.measuredOn}. Every one of the ${runs} run(s) cleared the ` +
          `${CALIBRATION.floor} floor.`,
        'This machine was fit to judge, so a failure above is a statement about the',
        'product and not about the laptop.',
      ],
    }
  }
  /*
   * THE MIDDLE STATE, AND THE ONE SENTENCE IT EXISTS TO STOP BEING PRINTED.
   *
   * A median over the whole collection cannot speak for a URL whose own five runs
   * were the starved ones, and on 13 September 2026 it spoke for three of them and
   * was wrong about all three (this file's header carries the collection). So when
   * the spread straddles the floor the product claim is NOT made, the count is
   * stated, and the reader is sent to the per-URL bands, which are judged on
   * exactly the runs the assertion used.
   *
   * It is not a waiver and it cannot become one: same exit code, same floors, and
   * a URL measured above the floor is still called a statement about the product.
   */
  if (mid >= CALIBRATION.floor) {
    return {
      state: 'mixed',
      median: mid,
      low,
      high,
      ratio,
      belowFloor,
      runs,
      lines: [
        `Machine calibration: NOT UNIFORM. BenchmarkIndex median ${Math.round(mid)} (${band}), ` +
          `${pct}% of the ${CALIBRATION.derivedAt} the floors were confirmed at ` +
          `on ${CALIBRATION.measuredOn}, but ${belowFloor} of ${runs} run(s) were taken ` +
          `BELOW the ${CALIBRATION.floor} floor.`,
        '',
        'The median of the whole collection is not what any floor is asserted on. A',
        "category floor is asserted on the median of ONE URL's runs, so a collection",
        'can sit above the floor overall while one URL was measured entirely on the',
        'slow runs. That is what happened on 13 September 2026, the day this machine',
        'started carrying three builds at once: three URLs came back under their',
        'floors with NOT ONE PRODUCT BYTE changed from a tip whose own gate had',
        'passed the same step four hours earlier.',
        '',
        'SO THIS IS NOT A STATEMENT ABOUT THE PRODUCT AND IT IS NOT A WAIVER EITHER.',
        'Read the per-URL bands below: a failure on a URL marked fit is the product,',
        'a failure on one marked NOT FIT has to be re-taken on a quiet machine.',
        '  node scripts/perf/machine-speed.mjs        what the machine is capable of now',
        '  npm run gate:push -- --only lighthouse     the step on its own',
        '',
        'The floors are unchanged, the exit code is unchanged, and nothing was pushed.',
      ],
    }
  }
  return {
    state: 'degraded',
    median: mid,
    low,
    high,
    ratio,
    belowFloor,
    runs,
    lines: [
      `Machine calibration: DEGRADED. BenchmarkIndex median ${Math.round(mid)} (${band}), ` +
        `${pct}% of the ${CALIBRATION.derivedAt} the floors were confirmed at ` +
        `on ${CALIBRATION.measuredOn} (evidence ${CALIBRATION.evidence}).`,
      '',
      'A collection taken this far below the derivation band is NOT comparable with',
      'the one the floors came from. On 8 September 2026 a collection at 1113 to 1993',
      "refused main's own tree against these same floors, hours after that tree had",
      'cleared them three times; re-measured the next day at 2665 to 2755 it cleared',
      'them again with nothing changed but the machine.',
      '',
      'SO BEFORE READING THE FAILURE ABOVE AS A REGRESSION: free this machine and run',
      'the step again.',
      '  node scripts/perf/machine-speed.mjs        what the machine is capable of now',
      '  npm run gate:push -- --only lighthouse     the step on its own',
      '',
      'NOTHING WAS PUSHED AND NOTHING WAS EXCUSED. This is the diagnosis, not a waiver:',
      'the floors are unchanged, the exit code is unchanged, and a slow page still',
      'blocks. If the numbers repeat on a calibrated machine, it is a regression.',
    ],
  }
}

/**
 * The whole block the gate prints under a failed Lighthouse assertion.
 *
 * @param {Array<{ environment?: { benchmarkIndex?: number } }>} lhrs
 * @returns {string}
 */
export function calibrationReport(lhrs) {
  const verdict = judgeCalibration(benchmarkIndexes(lhrs))
  return [...verdict.lines, ...perUrlLines(lhrs)].join(String.fromCharCode(10))
}
