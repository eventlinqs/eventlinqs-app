import { describe, expect, test } from 'vitest'
import { learnPatterns, patternKey, RETIRE_AFTER_MISSES, type Observation } from '../../../src/lib/listings/source-patterns'

/**
 * LEARNING PART 3 (the CONTROLLER's 08:42 of 7 November 2026): each source's schedule patterns are stored with the day first
 * seen; a page that stops matching its pattern hands its nights to the resolver to hold, never to publish.
 */

const TRIVIA = { host: 'murphys.example', sourceUrl: 'https://murphys.example/whats-on', title: 'Front Bar Trivia' }
const obs = (matched: Observation['matched'], eventIds: string[] = ['e1', 'e2']): Observation => ({ ...TRIVIA, matched, eventIds })

describe('remembering a schedule', () => {
  test('a schedule first vouched for today is learned, first seen today', () => {
    const { patterns, broken, learned } = learnPatterns([], [obs('weekly_beside_title')], '2026-11-08')
    expect(learned).toBe(1)
    expect(broken).toEqual([])
    expect(patterns[0]).toMatchObject({ kind: 'weekly_beside_title', firstSeen: '2026-11-08', lastMatched: '2026-11-08', misses: 0, retired: false })
  })
  test('matched again keeps the day it was first seen and moves the last match', () => {
    const day1 = learnPatterns([], [obs('weekly_beside_title')], '2026-11-08').patterns
    const day2 = learnPatterns(day1, [obs('weekly_beside_title')], '2026-11-09')
    expect(day2.learned).toBe(0)
    expect(day2.patterns[0]).toMatchObject({ firstSeen: '2026-11-08', lastMatched: '2026-11-09' })
  })
  test('the same night on the same page is one pattern, whatever its case or a trailing slash', () => {
    expect(patternKey('Murphys.example', 'https://murphys.example/whats-on/', 'FRONT BAR  Trivia!')).toBe(patternKey('murphys.example', 'https://murphys.example/whats-on', 'front bar trivia'))
  })
})

describe('a page that stops matching', () => {
  test('its nights go to the resolver, with the reason in plain words', () => {
    const day1 = learnPatterns([], [obs('weekly_beside_title')], '2026-11-08').patterns
    const { broken, patterns } = learnPatterns(day1, [obs(null, ['e7'])], '2026-11-09')
    expect(broken).toHaveLength(1)
    expect(broken[0].eventIds).toEqual(['e7'])
    expect(broken[0].why).toBe("murphys.example stated Front Bar Trivia's schedule in its own words from 2026-11-08 to 2026-11-08 and does not today")
    expect(patterns[0]).toMatchObject({ misses: 1, retired: false })
  })
  test(`missed ${RETIRE_AFTER_MISSES} days running, the pattern is retired and no longer handed over`, () => {
    let memory = learnPatterns([], [obs('monthly_words')], '2026-11-01').patterns
    const brokenEachDay: number[] = []
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
      const r = learnPatterns(memory, [obs(null)], d)
      memory = r.patterns
      brokenEachDay.push(r.broken.length)
    }
    expect(brokenEachDay).toEqual([1, 1, 1, 0])
    expect(memory[0]).toMatchObject({ misses: RETIRE_AFTER_MISSES, retired: true })
  })
  test('a retired pattern stated again is learned back, its first day kept', () => {
    let memory = learnPatterns([], [obs('monthly_words')], '2026-11-01').patterns
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) memory = learnPatterns(memory, [obs(null)], d).patterns
    const back = learnPatterns(memory, [obs('monthly_words')], '2026-11-10')
    expect(back.patterns[0]).toMatchObject({ retired: false, misses: 0, firstSeen: '2026-11-01', lastMatched: '2026-11-10' })
  })
  test('a listing never vouched for in schedule words is not a pattern and is never handed over here', () => {
    expect(learnPatterns([], [obs(null)], '2026-11-08')).toEqual({ patterns: [], broken: [], learned: 0 })
  })
  test('a pattern with no night in today\'s sweep is kept as it is', () => {
    const day1 = learnPatterns([], [obs('every_in_range')], '2026-11-08').patterns
    const r = learnPatterns(day1, [], '2026-11-09')
    expect(r.patterns).toEqual(day1)
    expect(r.broken).toEqual([])
  })
})
