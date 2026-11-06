import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE ENGINE'S LESSONS CANNOT RETURN (learning part 2 of the CONTROLLER's 08:42 of 7 November 2026). Every wrong fact the
 * accuracy sweep found and the engine fixed is a lesson: its class, its case, and the test that asserts the right value.
 * Those tests run in the suite, so a fix that breaks an old lesson fails the gate; this holds the corpus itself: a lesson's
 * test may not vanish or stop naming its case, and the corpus may not shrink below its floor, which only ever rises.
 */
type Lesson = { class: string; case: string; test: string; names: string }
const corpus = JSON.parse(readFileSync('tests/unit/lessons/engine-lessons.json', 'utf8')) as { floor: number; lessons: Lesson[] }

describe('the engine lessons corpus', () => {
  it('never falls below its floor', () => {
    expect(corpus.lessons.length).toBeGreaterThanOrEqual(corpus.floor)
  })
  for (const l of corpus.lessons) {
    it(`class ${l.class}: ${l.case}`, () => {
      expect(existsSync(l.test), `${l.test} is gone`).toBe(true)
      expect(readFileSync(l.test, 'utf8'), `${l.test} no longer names '${l.names}'`).toContain(l.names)
    })
  }
  it('every lesson names a class and a case, and no two lessons are the same case', () => {
    expect(corpus.lessons.every((l) => /^[A-Z]$/.test(l.class) && l.case.length > 10)).toBe(true)
    expect(new Set(corpus.lessons.map((l) => l.case)).size).toBe(corpus.lessons.length)
  })
})
