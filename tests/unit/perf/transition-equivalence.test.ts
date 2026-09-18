/**
 * THE TWO FORMS OF THE SAME TRANSITION.
 *
 * `scripts/verify/lib/transition-equivalence.mjs` exists because the browse
 * card collapse (close-out C8B.3, 19 September 2026) moved a transition from a
 * shorthand that names its duration twice to longhands that name it once, and
 * the computed-style drive reported eighteen faults for a change that alters
 * nothing a visitor can see.
 *
 * The risk in normalising is the obvious one: a normaliser that is too eager
 * hides a real regression. So the cases below fix BOTH directions - what must
 * be treated as equal, and what must still be reported as different - and the
 * comma splitter is tested against `cubic-bezier(...)`, whose own three commas
 * are what a naive split gets wrong.
 */
import { describe, expect, it } from 'vitest'
import {
  comparableValue,
  normaliseTransitionList,
  splitCssList,
  transitionPropertyCount,
} from '../../../scripts/verify/lib/transition-equivalence.mjs'

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

describe('splitCssList', () => {
  it('splits on top-level commas', () => {
    expect(splitCssList('transform, box-shadow')).toEqual(['transform', 'box-shadow'])
  })

  it('does not split inside a function, which is the case that matters', () => {
    expect(splitCssList(EASE)).toEqual([EASE])
    expect(splitCssList(`${EASE}, ${EASE}`)).toEqual([EASE, EASE])
  })

  it('returns one empty entry for an empty value rather than nothing', () => {
    expect(splitCssList('')).toEqual([''])
  })
})

describe('transitionPropertyCount', () => {
  it('counts a real property list', () => {
    expect(transitionPropertyCount('transform, box-shadow')).toBe(2)
    expect(transitionPropertyCount('transform, box-shadow, color')).toBe(3)
  })

  it('treats none and all as one, because neither is a list to repeat across', () => {
    expect(transitionPropertyCount('none')).toBe(1)
    expect(transitionPropertyCount('all')).toBe(1)
  })

  it('treats a missing value as one rather than throwing', () => {
    expect(transitionPropertyCount(undefined)).toBe(1)
    expect(transitionPropertyCount('')).toBe(1)
  })
})

describe('normaliseTransitionList', () => {
  it('expands a single value across the property count', () => {
    expect(normaliseTransitionList('0.2s', 2)).toBe('0.2s, 0.2s')
    expect(normaliseTransitionList(EASE, 2)).toBe(`${EASE}, ${EASE}`)
  })

  it('leaves a list that is already the right length alone', () => {
    expect(normaliseTransitionList('0.2s, 0.2s', 2)).toBe('0.2s, 0.2s')
  })

  it('leaves a list of DIFFERENT values alone, so a real change is still a change', () => {
    expect(normaliseTransitionList('0.2s, 0.3s', 2)).toBe('0.2s, 0.3s')
  })

  it('does nothing when one property is transitioned', () => {
    expect(normaliseTransitionList('0.2s', 1)).toBe('0.2s')
  })
})

describe('comparableValue', () => {
  const shorthandForm = {
    'transition-property': 'transform, box-shadow',
    'transition-duration': '0.2s, 0.2s',
    'transition-timing-function': `${EASE}, ${EASE}`,
  }
  const longhandForm = {
    'transition-property': 'transform, box-shadow',
    'transition-duration': '0.2s',
    'transition-timing-function': EASE,
  }

  it('makes the two forms of the same transition compare equal', () => {
    for (const property of ['transition-duration', 'transition-timing-function']) {
      expect(comparableValue(longhandForm, property)).toBe(comparableValue(shorthandForm, property))
    }
  })

  it('still reports a duration that actually changed', () => {
    const slower = { ...longhandForm, 'transition-duration': '0.4s' }
    expect(comparableValue(slower, 'transition-duration')).not.toBe(
      comparableValue(shorthandForm, 'transition-duration'),
    )
  })

  it('still reports a transition that was switched off', () => {
    const off = { 'transition-property': 'none', 'transition-duration': '0s' }
    expect(comparableValue(off, 'transition-duration')).toBe('0s')
    expect(comparableValue(off, 'transition-duration')).not.toBe(
      comparableValue(shorthandForm, 'transition-duration'),
    )
  })

  it('passes every other property through untouched', () => {
    const bag = { 'transition-property': 'transform, box-shadow', 'box-shadow': 'none' }
    expect(comparableValue(bag, 'box-shadow')).toBe('none')
    expect(comparableValue(bag, 'transition-property')).toBe('transform, box-shadow')
  })
})
