/**
 * THE DIAGNOSIS THAT COST A SESSION TO LEARN, PINNED.
 *
 * scripts/guards/gate-names-the-instrument.mjs holds that the diagnosis still
 * HAPPENS. This file holds that it is RIGHT, which a source-reading guard cannot
 * judge, and that it can never turn into a waiver.
 *
 * The measurement behind it (C:\dev\EVIDENCE\P0.7-D, 9 September 2026): on
 * 8 September the local gate refused main's own tree against floors that same
 * tree had cleared three times hours earlier, with script bytes identical to the
 * byte. Re-measured on 9 September, every URL cleared every floor on a locally
 * served build AND on the Vercel preview. The only thing that had changed was
 * the laptop, BenchmarkIndex 2665 to 2755 against 1113 to 1993.
 */
import { describe, expect, it } from 'vitest'
import {
  CALIBRATION,
  benchmarkIndexes,
  calibrationReport,
  judgeCalibration,
  perUrlBands,
  perUrlLines,
} from '../../../scripts/ci/lighthouse-calibration.mjs'

/** The readings Lighthouse recorded on the evening the gate refused main's tree. */
const REFUSING_EVENING = [1340, 1632, 1113, 1976, 1993]
/** The readings from the two collections that confirmed the floors hold. */
const CONFIRMING_DAY = [2665, 2707, 2730, 2742, 2755]
/**
 * THE THREE LANE AFTERNOON, 13 September 2026. The collection whose median
 * cleared the floor while its slowest runs sat below the bottom of the refusing
 * evening's own band, and which the first version of this module called a
 * statement about the product. It was not: the only diff from the tip whose gate
 * had passed the same step four hours earlier was four drive scripts, two
 * libraries and one unit test, none of them in the build.
 */
const THREE_LANE_AFTERNOON = [1071, 2100, 2379, 2600, 2707]

describe('the calibration record carries its own evidence', () => {
  it('states when it was measured and where the evidence is', () => {
    expect(CALIBRATION.measuredOn).toBe('2026-09-09')
    expect(CALIBRATION.evidence).toContain('P0.7-D')
  })

  it('puts the floor above every reading from the refusing evening', () => {
    expect(Math.max(...REFUSING_EVENING)).toBeLessThan(CALIBRATION.floor)
  })

  it('puts the floor well below every reading from the confirming day', () => {
    expect(Math.min(...CONFIRMING_DAY)).toBeGreaterThan(CALIBRATION.floor)
  })

  it('derives from a band the confirming readings actually sit in', () => {
    const [low, high] = CALIBRATION.derivedRange
    expect(low).toBeLessThanOrEqual(Math.min(...CONFIRMING_DAY))
    expect(high).toBeGreaterThanOrEqual(Math.max(...CONFIRMING_DAY))
    expect(CALIBRATION.derivedAt).toBeGreaterThanOrEqual(low)
    expect(CALIBRATION.derivedAt).toBeLessThanOrEqual(high)
  })
})

describe('judgeCalibration names the instrument', () => {
  it('calls the refusing evening DEGRADED', () => {
    const verdict = judgeCalibration(REFUSING_EVENING)
    expect(verdict.state).toBe('degraded')
    expect(verdict.median).toBe(1632)
  })

  it('calls the confirming day CALIBRATED', () => {
    const verdict = judgeCalibration(CONFIRMING_DAY)
    expect(verdict.state).toBe('calibrated')
    expect(verdict.belowFloor).toBe(0)
  })

  /*
   * THE CASE THE FIRST VERSION GOT WRONG. Same median verdict, opposite meaning:
   * a collection whose median clears the floor and whose slowest runs do not is
   * not a machine that was fit to judge, and must not be reported as one.
   */
  it('refuses to call a straddling collection a statement about the product', () => {
    const verdict = judgeCalibration(THREE_LANE_AFTERNOON)
    expect(verdict.state).toBe('mixed')
    expect(verdict.median).toBeGreaterThanOrEqual(CALIBRATION.floor)
    expect(verdict.low).toBeLessThan(CALIBRATION.floor)
    expect(verdict.belowFloor).toBe(1)
    expect(verdict.runs).toBe(5)
    const text = verdict.lines.join(' ')
    expect(text).toContain('NOT UNIFORM')
    expect(text).toContain('1 of 5 run(s) were taken BELOW')
    // The exact sentence that was false on 13 September 2026.
    expect(text).not.toContain('This machine was fit to judge')
    expect(text).not.toContain('statement about the product and not about the laptop')
  })

  it('still says the product when every run cleared the floor', () => {
    const text = judgeCalibration(CONFIRMING_DAY).lines.join(' ')
    expect(text).toContain('This machine was fit to judge')
  })

  it('says so plainly when no report carries a reading', () => {
    const verdict = judgeCalibration([])
    expect(verdict.state).toBe('unknown')
    expect(verdict.median).toBeNull()
    expect(verdict.lines.join(' ')).toContain('NOT KNOWN')
  })

  it('reports the reading as a percentage of the derivation, not as a verdict on the product', () => {
    const verdict = judgeCalibration(REFUSING_EVENING)
    const text = verdict.lines.join(' ')
    expect(text).toContain('1632')
    expect(text).toContain(`${Math.round((1632 / CALIBRATION.derivedAt) * 100)}%`)
  })
})

describe('it can never become a waiver', () => {
  it('says in the degraded message that nothing was excused', () => {
    const text = judgeCalibration(REFUSING_EVENING).lines.join(' ')
    expect(text).toContain('NOTHING WAS PUSHED AND NOTHING WAS EXCUSED')
    expect(text).toContain('the floors are unchanged')
  })

  it('tells the reader how to re-take the measurement rather than how to pass', () => {
    const text = judgeCalibration(REFUSING_EVENING).lines.join(' ')
    expect(text).toContain('machine-speed.mjs')
    expect(text).toContain('--only lighthouse')
    // The one thing it must never suggest.
    expect(text.toLowerCase()).not.toContain('lower the floor')
  })

  it('says in the NOT UNIFORM message that nothing was excused', () => {
    const text = judgeCalibration(THREE_LANE_AFTERNOON).lines.join(' ')
    expect(text).toContain('IT IS NOT A WAIVER')
    expect(text).toContain('The floors are unchanged, the exit code is unchanged')
    expect(text.toLowerCase()).not.toContain('lower the floor')
  })

  it('offers no field a caller could read as permission to pass', () => {
    for (const readings of [REFUSING_EVENING, CONFIRMING_DAY, THREE_LANE_AFTERNOON, []]) {
      const verdict = judgeCalibration(readings)
      expect(Object.keys(verdict).sort()).toEqual([
        'belowFloor',
        'high',
        'lines',
        'low',
        'median',
        'ratio',
        'runs',
        'state',
      ])
      // The structural pin above is a list somebody has to update deliberately.
      // This is the intent behind it, and it holds whatever the list becomes.
      for (const key of Object.keys(verdict)) {
        expect(key).not.toMatch(/ok|pass|waive|skip|allow|excuse|override/i)
      }
    }
  })
})

/*
 * THE UNIT THE FLOORS ARE ACTUALLY ASSERTED ON. lighthouserc.json aggregates a
 * category score as the median of ONE URL's runs, so the machine reading that
 * qualifies it is the median of those same runs. On 13 September 2026 the
 * collection median said 2379 while one URL's own five runs were the starved
 * ones, and its failure was reported as the product.
 */
describe('perUrlBands names the instrument where the assertion is made', () => {
  const report = (url: string, benchmarkIndex: number) => ({
    finalDisplayedUrl: url,
    environment: { benchmarkIndex },
  })
  /*
   * The shape of the real thing: most URLs measured on a fit machine, one URL
   * whose own five runs were the starved ones. The collection median therefore
   * clears the floor, which is exactly how the defect hid.
   */
  const collection = [
    ...[2700, 2680, 2710, 2690, 2705].map((b) => report('http://127.0.0.1:1/', b)),
    ...[2600, 2640, 2620, 2660, 2610].map((b) => report('http://127.0.0.1:1/organisers', b)),
    ...[1200, 1100, 1300, 1250, 1150].map((b) => report('http://127.0.0.1:1/events/slow', b)),
  ]

  it('groups by URL and judges each URL on its own runs', () => {
    const rows = perUrlBands(collection)
    expect(rows).toHaveLength(3)
    // Slowest first, so the least trustworthy failure is read first.
    expect(rows[0].url).toContain('/events/slow')
    expect(rows[0].runs).toBe(5)
    expect(rows[0].median).toBe(1200)
    expect(rows[0].low).toBe(1100)
    expect(rows[0].high).toBe(1300)
    expect(rows[0].fit).toBe(false)
    expect(rows[1].fit).toBe(true)
    expect(rows[2].fit).toBe(true)
    // And the collection median clears the floor, which is how this hid.
    expect(judgeCalibration(benchmarkIndexes(collection)).state).toBe('mixed')
  })

  it('ignores reports with no URL or no reading rather than inventing one', () => {
    expect(perUrlBands([{ environment: { benchmarkIndex: 2700 } }])).toEqual([])
    expect(perUrlBands([{ finalDisplayedUrl: 'http://x/' }])).toEqual([])
    expect(perUrlBands([])).toEqual([])
    expect(perUrlBands(undefined)).toEqual([])
  })

  it('reads requestedUrl when a report carries no final URL', () => {
    const rows = perUrlBands([{ requestedUrl: 'http://127.0.0.1:1/p', environment: { benchmarkIndex: 2500 } }])
    expect(rows[0].url).toBe('http://127.0.0.1:1/p')
  })

  it('says which URLs were not fit, and never that one of them passed', () => {
    const text = perUrlLines(collection).join('\n')
    expect(text).toContain('NOT FIT')
    expect(text).toContain('/events/slow')
    expect(text).toContain('1 of 3 URL(s) were measured BELOW the floor')
    expect(text).toContain('A failure on a URL marked fit IS about the product')
    expect(text).toContain('nothing was excused and nothing was pushed')
  })

  it('prints nothing at all when there is nothing to group', () => {
    expect(perUrlLines([])).toEqual([])
  })

  it('reaches the pasted report, so the gate prints it under the verdict', () => {
    const text = calibrationReport(collection)
    expect(text).toContain('NOT UNIFORM')
    expect(text).toContain('NOT FIT')
  })
})

describe('benchmarkIndexes reads what Lighthouse recorded', () => {
  it('takes the reading out of each report and ignores reports without one', () => {
    const lhrs = [
      { environment: { benchmarkIndex: 2700 } },
      { environment: {} },
      {},
      { environment: { benchmarkIndex: 1100 } },
    ]
    expect(benchmarkIndexes(lhrs)).toEqual([2700, 1100])
  })

  it('produces a report a reader can paste into a log unchanged', () => {
    const lhrs = REFUSING_EVENING.map((benchmarkIndex) => ({ environment: { benchmarkIndex } }))
    const report = calibrationReport(lhrs)
    expect(report).toContain('DEGRADED')
    expect(report.split('\n').length).toBeGreaterThan(5)
  })
})
