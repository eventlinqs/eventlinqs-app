import { describe, expect, test } from 'vitest'
import { isOnScale, offendingTerms, findViolations, scanTree } from '../../../scripts/guards/no-hardcoded-spacing.mjs'

/**
 * THE SPACING GUARD (close-out C14.12): a hardcoded spacing value is a raw
 * length off the 4px grid on a padding, margin, gap or inset. Tokens, zero,
 * relationships (auto, %, em, calc) and multiples of 4px all pass.
 */
describe('isOnScale', () => {
  test('multiples of 4px and 0.25rem pass, anything else in px or rem fails', () => {
    for (const ok of ['0', '4px', '16px', '52px', '320px', '0.25rem', '1rem', '3.25rem', '20rem', '-8px', '-0.5rem']) {
      expect(isOnScale(ok), ok).toBe(true)
    }
    for (const bad of ['13px', '18px', '2px', '6px', '0.625rem', '0.3rem', '14px']) {
      expect(isOnScale(bad), bad).toBe(false)
    }
  })

  test('tokens pass, with or without a fallback', () => {
    expect(isOnScale('var(--space-4)')).toBe(true)
    expect(isOnScale('var(--space-card-padding-y)')).toBe(true)
    expect(isOnScale('var(--site-nav-height,64px)')).toBe(true)
  })

  test('relationships pass: auto, percentages, em, calc, env', () => {
    for (const ok of ['auto', '50%', '1.5em', '2ch', 'calc(100% - 8px)', 'env(safe-area-inset-bottom, 0px)', '100vh']) {
      expect(isOnScale(ok), ok).toBe(true)
    }
  })
})

describe('offendingTerms', () => {
  test('judges every term of a shorthand and keeps a function call whole', () => {
    expect(offendingTerms('12px 28px')).toEqual([])
    expect(offendingTerms('14px 28px')).toEqual(['14px'])
    expect(offendingTerms('env(safe-area-inset-bottom, 0px)')).toEqual([])
    expect(offendingTerms('0.125rem_0.375rem')).toEqual(['0.125rem', '0.375rem'])
  })
})

describe('findViolations', () => {
  test('an arbitrary spacing utility off the grid fails, one on the grid passes', () => {
    const src = '<div className="p-[13px] sm:mt-[0.3rem] lg:mr-[20rem] pl-[3.25rem] gap-[18px]" />'
    const v = findViolations(src, 'src/x.tsx')
    expect(v.map((x) => x.text)).toEqual(['p-[13px]', 'sm:mt-[0.3rem]', 'gap-[18px]'])
  })

  test('widths, heights, translations and font sizes are not spacing', () => {
    const src = '<div className="w-[13px] h-[18px] translate-x-[3px] text-[11px] min-h-[220px] max-w-[140px]" />'
    expect(findViolations(src, 'src/x.tsx')).toEqual([])
  })

  test('an inline style off the grid fails, a token passes, and a key that merely starts with a property name is ignored', () => {
    expect(findViolations("style={{ padding: '2px 6px' }}", 'src/x.tsx').map((x) => x.bad)).toEqual([['2px', '6px']])
    expect(findViolations("style={{ paddingTop: 'var(--space-card-padding-y)' }}", 'src/x.tsx')).toEqual([])
    expect(findViolations("  topicSlug: 'getting-started',", 'src/x.tsx')).toEqual([])
    expect(findViolations("style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}", 'src/x.tsx')).toEqual([])
  })

  test('a stylesheet declaration off the grid fails, a comment never does, a token definition never does', () => {
    expect(findViolations('.a {\n  margin-top: 5px;\n}', 'src/a.css').map((x) => x.text)).toEqual(['margin-top: 5px'])
    expect(findViolations('/* right: 0 with translateX(100%), horizontal scroll rails */\n.a { padding: 8px; }', 'src/a.css')).toEqual([])
    expect(findViolations(':root {\n  --space-card-padding-y: 20px;\n  --space-tight-gap: 8px;\n}', 'src/a.css')).toEqual([])
    expect(findViolations('.b { padding: 0.75rem 1rem; }', 'src/b.css')).toEqual([])
  })

  test('a line marked spacing-guard: ignore is skipped', () => {
    expect(findViolations('<div className="p-[13px]" /> {/* spacing-guard: ignore */}', 'src/x.tsx')).toEqual([])
  })
})

describe('against the real tree', () => {
  test('every spacing value under src is on the scale', () => {
    const { files, violations } = scanTree()
    expect(files).toBeGreaterThan(500)
    expect(violations).toEqual([])
  }, 60000)
})
