import { describe, it, expect } from 'vitest'
import { countDarkRuns, detectSeatCount } from '@/lib/seating/detect'

/**
 * F20: the assisted-detection counting core. The original inline counter
 * zeroed its light-gap counter on the first dark sample, so the second
 * dark sample always read a gap of zero and NO run was ever counted: the
 * feature silently fell back to even spacing on every plan. These tests
 * pin the fixed maths.
 */

/** Build a luminance profile: `gap` light samples between `count` dark blobs. */
function dotProfile(count: number, blobWidth = 6, gap = 10): number[] {
  const lums: number[] = Array(gap).fill(250)
  for (let i = 0; i < count; i++) {
    lums.push(...Array(blobWidth).fill(30))
    lums.push(...Array(gap).fill(250))
  }
  return lums
}

describe('assisted detection counting (F20)', () => {
  it('counts twelve dots as twelve seats', () => {
    expect(detectSeatCount(dotProfile(12))).toBe(12)
  })

  it('the first dot after the leading light stretch counts (the original bug)', () => {
    // Two dots only: the old counter returned 0 because the light gap was
    // wiped before it was read; the fix counts both.
    expect(detectSeatCount(dotProfile(2))).toBe(2)
  })

  it('a flat line (no plan contrast) is honestly null', () => {
    expect(detectSeatCount(Array(500).fill(245))).toBeNull()
    expect(detectSeatCount(Array(500).fill(30))).toBeNull()
  })

  it('a single blob is not a row', () => {
    expect(detectSeatCount(dotProfile(1))).toBeNull()
  })

  it('single-sample specks do not count as seats', () => {
    const lums = Array(40).fill(250)
    lums[10] = 20 // one noisy pixel
    lums.push(...dotProfile(3))
    expect(detectSeatCount(lums)).toBe(3)
  })

  it('adjacent blobs with no separating gap read as one seat', () => {
    const lums = [...Array(10).fill(250), ...Array(30).fill(25), ...Array(10).fill(250)]
    expect(countDarkRuns(lums, 100)).toBe(1)
  })

  it('the count caps at sixty', () => {
    expect(detectSeatCount(dotProfile(80))).toBe(60)
  })
})
