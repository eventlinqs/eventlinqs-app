/**
 * A CONTRACT THAT READS CODE, NOT PROSE.
 *
 * `scripts/guards/lib/strip-js-comments.mjs` exists because a guard drill on
 * 19 September 2026 deleted `cv-section` from the one constant that applies it
 * and the guard PASSED: the comment on the same line still said the word.
 * Every homepage rail would have stopped skipping below-the-fold layout with
 * the contract that exists to catch that reporting green.
 *
 * The other half of the risk is the fix over-reaching: a naive `//` strip
 * eats the second half of every `'https://...'` in the repository, and a
 * guard that fails on code that is fine gets switched off. Both directions
 * are fixed here.
 */
import { describe, expect, it } from 'vitest'
import { stripJsComments } from '../../../scripts/guards/lib/strip-js-comments.mjs'

describe('stripJsComments', () => {
  it('removes a line comment', () => {
    expect(stripJsComments('const a = 1 // cv-section lives here').includes('cv-section')).toBe(false)
  })

  it('removes a block comment, including a multi-line one', () => {
    const src = 'const a = 1\n/* cv-section\n   was here */\nconst b = 2'
    expect(stripJsComments(src).includes('cv-section')).toBe(false)
  })

  it('keeps the code that was beside the comment', () => {
    const src = "export const SECTION_RAIL = 'cv-section py-6' // cv-section: skips layout"
    const stripped = stripJsComments(src)
    expect(stripped).toContain("'cv-section py-6'")
    expect(stripped.split("'cv-section py-6'")[1]).not.toContain('cv-section')
  })

  it('DOES NOT eat a URL inside a string, which is the mistake a regex makes', () => {
    const src = "const u = 'https://www.eventlinqs.com.au/events'"
    expect(stripJsComments(src)).toBe(src)
  })

  it('leaves a // inside a double-quoted string and inside a template literal', () => {
    expect(stripJsComments('const u = "http://x/y"')).toBe('const u = "http://x/y"')
    expect(stripJsComments('const u = `http://x/${y}`')).toBe('const u = `http://x/${y}`')
  })

  it('handles an escaped quote without ending the string early', () => {
    const src = "const s = 'it\\'s fine' // gone"
    const stripped = stripJsComments(src)
    expect(stripped).toContain("'it\\'s fine'")
    expect(stripped).not.toContain('gone')
  })

  it('preserves line numbers, so a guard can still report a line', () => {
    const src = 'a\n// b\nc\n/* d\n e */\nf'
    expect(stripJsComments(src).split('\n').length).toBe(src.split('\n').length)
  })

  it('preserves column positions by replacing a comment with spaces', () => {
    const src = 'const a = 1 // x'
    expect(stripJsComments(src).length).toBe(src.length)
  })

  it('leaves a string that merely looks like a comment opener alone', () => {
    const src = "const s = '/* not a comment */'"
    expect(stripJsComments(src)).toBe(src)
  })

  it('returns an empty string unchanged rather than throwing', () => {
    expect(stripJsComments('')).toBe('')
  })
})
