import { describe, expect, it } from 'vitest'
import { CLOCK_TIME_DATED_IN_WORDS } from '../../../scripts/guards/lib/clock-times.mjs'

/*
 * A CLOCK TIME DATED IN WORDS IS A TIME (the guard audit of 14 November 2026, C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md).
 * The 7 November stop, and the real ratios the guard must still see.
 */
describe('a time dated in words is not an aspect ratio', () => {
  it('reads the 7 November line as a time', () => {
    expect(CLOCK_TIME_DATED_IN_WORDS.test("the CONTROLLER's 21:54 of 6 November 2026, after Upstash's card charge failed")).toBe(true)
    expect(CLOCK_TIME_DATED_IN_WORDS.test('Lawal 18:31 on 13 November: pages under one second')).toBe(true)
  })

  it('leaves every real ratio to the guard', () => {
    for (const ratio of ['a 16:10 frame on Instagram', 'a 21:9 hero for Meta', 'a 9:16 story', '4:5 to 1.91:1 on the Graph API']) {
      expect(CLOCK_TIME_DATED_IN_WORDS.test(ratio), ratio).toBe(false)
    }
  })

  it('needs a real time and a month in words', () => {
    expect(CLOCK_TIME_DATED_IN_WORDS.test('a 25:61 of 6 November')).toBe(false)
    expect(CLOCK_TIME_DATED_IN_WORDS.test('16:10 of the frame')).toBe(false)
  })
})
