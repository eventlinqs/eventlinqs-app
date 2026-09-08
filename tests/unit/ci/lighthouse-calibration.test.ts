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
} from '../../../scripts/ci/lighthouse-calibration.mjs'

/** The readings Lighthouse recorded on the evening the gate refused main's tree. */
const REFUSING_EVENING = [1340, 1632, 1113, 1976, 1993]
/** The readings from the two collections that confirmed the floors hold. */
const CONFIRMING_DAY = [2665, 2707, 2730, 2742, 2755]

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

  it('offers no field a caller could read as permission to pass', () => {
    for (const readings of [REFUSING_EVENING, CONFIRMING_DAY, []]) {
      const verdict = judgeCalibration(readings)
      expect(Object.keys(verdict).sort()).toEqual(['high', 'lines', 'low', 'median', 'ratio', 'state'])
    }
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
