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
 * @returns {{ state: 'calibrated' | 'degraded' | 'unknown', median: number | null,
 *             low: number | null, high: number | null, ratio: number | null,
 *             lines: string[] }}
 *   `state` is the finding. `lines` is what a reader needs to see and is written
 *   to be pasted into a report unchanged.
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
  if (mid >= CALIBRATION.floor) {
    return {
      state: 'calibrated',
      median: mid,
      low,
      high,
      ratio,
      lines: [
        `Machine calibration: OK. BenchmarkIndex median ${Math.round(mid)} (${band}), ` +
          `${pct}% of the ${CALIBRATION.derivedAt} the floors were confirmed at ` +
          `on ${CALIBRATION.measuredOn}.`,
        'This machine was fit to judge, so a failure above is a statement about the',
        'product and not about the laptop.',
      ],
    }
  }
  return {
    state: 'degraded',
    median: mid,
    low,
    high,
    ratio,
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
  return verdict.lines.join(String.fromCharCode(10))
}
