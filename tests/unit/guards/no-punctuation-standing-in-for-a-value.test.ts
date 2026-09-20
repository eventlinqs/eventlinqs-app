import { describe, expect, it } from 'vitest'

import { judgeSource } from '../../../scripts/guards/no-punctuation-standing-in-for-a-value.mjs'

/**
 * THE GUARD'S JUDGEMENT, ON THE LINES THAT WERE REALLY IN THE TREE AND ON THE
 * ONES THAT LOOK LIKE THEM AND ARE FINE.
 *
 * The second half is the important half. This guard's first version reported
 * 21 findings on a clean tree, every one of them correct code composing a
 * string, and a gate that cries wolf 21 times is a gate somebody turns off.
 * The cases below pin the line between a placeholder and a punctuation mark
 * doing its job, so narrowing or widening it later is a deliberate act with a
 * failing test to change.
 */

const marks = (source: string): string[] =>
  (judgeSource(source) as { literal: string }[]).map((f) => f.literal)

describe('no-punctuation-standing-in-for-a-value', () => {
  describe('the lines the dash scrub really left', () => {
    it("catches a buyer's name falling back to a colon", () => {
      expect(marks(`<p>{buyerName || ':'}</p>`)).toEqual([':'])
    })

    it('catches a capacity falling back to a colon', () => {
      expect(marks(`<span>{tier.sold_count}/{tier.total_capacity || ':'}</span>`)).toEqual([':'])
    })

    it('catches a ternary branch falling back to a colon', () => {
      expect(marks(`<td>{total > 0 ? sold : ':'}</td>`)).toEqual([':'])
    })

    it('catches the other separator marks, so the class is held and not one character', () => {
      expect(marks(`<p>{name || '|'}</p>`)).toEqual(['|'])
      expect(marks(`<p>{name || ';'}</p>`)).toEqual([';'])
      expect(marks(`<p>{name ?? ','}</p>`)).toEqual([','])
    })
  })

  describe('the lines that look like it and are correct', () => {
    it("leaves the platform's own absent-value mark alone", () => {
      expect(marks(`<td>{refunds > 0 ? money(refunds) : '-'}</td>`)).toEqual([])
    })

    it('leaves a sign prefix alone', () => {
      expect(marks(`<span>{delta > 0 ? '+' : ''}{delta}</span>`)).toEqual([])
    })

    it('leaves a route default alone', () => {
      expect(marks(`<Link href={href || '/'}>Home</Link>`)).toEqual([])
    })

    it('leaves query-string composition alone', () => {
      expect(marks(`const sep = url.includes('?') ? '&' : '?'`)).toEqual([])
    })

    it('leaves a label with its word attached alone', () => {
      expect(marks(`<span className="text-ink-400">Name:</span>`)).toEqual([])
    })

    it('leaves a separator carrying its spaces alone', () => {
      expect(marks(`<p>{city}{' | '}{state}</p>`)).toEqual([])
    })
  })

  /**
   * The guard's own header spells out every offending line it was written for.
   * Reading its own post-mortem would make it pass on a violating tree, which
   * is the failure mode this constitution names by name.
   */
  it('reads code and not comments', () => {
    const source = [
      "/* This used to read {buyerName || ':'} and every guest order said Name: : */",
      "<p>{buyerName || 'Not given'}</p>",
    ].join('\n')
    expect(marks(source)).toEqual([])
  })

  it('reports the line the reader will open', () => {
    const source = ['<div>', '  <p>ok</p>', "  <p>{name || ':'}</p>", '</div>'].join('\n')
    const found = judgeSource(source) as { line: number }[]
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(3)
  })
})
