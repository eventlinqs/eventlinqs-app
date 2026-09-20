import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { judgeFile, openingTag, classesOf } from '../../../scripts/guards/a-table-a-phone-can-read.mjs'
import { findViolations } from '../../../scripts/guards/no-hardcoded-spacing.mjs'

/**
 * THE CLAUSES OF a-table-a-phone-can-read, EACH AGAINST MARKUP THAT ISOLATES IT.
 *
 * The guard itself is drilled red and green through the whole tree
 * (scripts/verify/guard-failure-drills.mjs, five drills). These tests do the
 * other half: they pin the JUDGEMENT on inputs a drill cannot produce, which is
 * where a source-reading guard actually goes wrong - a class string inside a
 * comment, a template literal containing a `>`, a second table in one file.
 */

const clauses = (source: string): string[] =>
  (judgeFile(source) as { clause: string }[]).map((f) => f.clause)

const PASSING_TABLE = `
export function Fine() {
  return (
    <div className="rounded-xl border lg:overflow-x-auto">
      <table className="w-full text-sm max-lg:block lg:min-w-[560px]">
        <thead className="max-lg:hidden"><tr><th>Code</th></tr></thead>
        <tbody className="max-lg:block">
          <tr className="max-lg:block"><td className="max-lg:block">A</td></tr>
        </tbody>
      </table>
    </div>
  )
}
`

describe('a-table-a-phone-can-read', () => {
  it('passes a table that stops being a table below lg', () => {
    expect(clauses(PASSING_TABLE)).toEqual([])
  })

  it('fails a table with no phone presentation', () => {
    const source = PASSING_TABLE.replace('w-full text-sm max-lg:block', 'w-full text-sm')
    expect(clauses(source)).toContain('phone-presentation')
  })

  it('fails a header that stays while the cells stack', () => {
    const source = PASSING_TABLE.replace('<thead className="max-lg:hidden">', '<thead>')
    expect(clauses(source)).toContain('header')
  })

  it('fails an unqualified minimum width and accepts an lg-qualified one', () => {
    const bad = PASSING_TABLE.replace('lg:min-w-[560px]', 'min-w-[560px]')
    expect(clauses(bad)).toContain('min-width')
    expect(clauses(PASSING_TABLE)).not.toContain('min-width')
  })

  it('fails a horizontal overflow that applies at phone width', () => {
    const source = PASSING_TABLE.replace('lg:overflow-x-auto', 'overflow-x-auto')
    expect(clauses(source)).toContain('overflow')
  })

  /**
   * The discount codes wrapper really does need `overflow-hidden` from lg up:
   * it is what keeps the table's corners inside the card's rounded border. The
   * pairing is the whole reason the clause is not simply "no overflow-hidden".
   */
  it('accepts overflow-hidden when it is neutralised below lg', () => {
    const source = PASSING_TABLE.replace(
      'rounded-xl border lg:overflow-x-auto',
      'rounded-xl border overflow-hidden max-lg:overflow-visible',
    )
    expect(clauses(source)).toEqual([])
  })

  it('fails a control in the table body with no 44px floor, and accepts ROW_CONTROL', () => {
    const bad = PASSING_TABLE.replace(
      '<td className="max-lg:block">A</td>',
      '<td className="max-lg:block"><button className="text-xs underline">Delete</button></td>',
    )
    expect(clauses(bad)).toContain('touch-target')

    const good = PASSING_TABLE.replace(
      '<td className="max-lg:block">A</td>',
      '<td className="max-lg:block"><button className={`${ROW_CONTROL} text-error`}>Delete</button></td>',
    )
    expect(clauses(good)).not.toContain('touch-target')
  })

  /**
   * THE ONE THAT MATTERS MOST, and the reason every file this guard judges can
   * safely carry a post-mortem: the strings it looks for all appear in the
   * prose explaining the defect. A guard that read them would pass a violating
   * tree while congratulating itself on the documentation.
   */
  it('reads code and not comments', () => {
    const source = `
      /* This table used to be an overflow-x-auto box with min-w-[560px] and a
         thead that never hid: className="w-full text-sm" was the whole of it. */
      ${PASSING_TABLE}
    `
    expect(clauses(source)).toEqual([])

    const commentOnly = `
      // <table className="w-full"> with a <thead> and an overflow-x-auto wrapper
      export const NOTHING = 1
    `
    expect(clauses(commentOnly)).toEqual([])
  })

  it('judges each table in a file with two of them', () => {
    const source = PASSING_TABLE + PASSING_TABLE.replace('<thead className="max-lg:hidden">', '<thead>')
    const findings = judgeFile(source) as unknown as { clause: string }[] & { tables: number }
    expect(findings.tables).toBe(2)
    expect(findings.map((f) => f.clause)).toEqual(['header'])
  })

  /**
   * A GUARD THAT SCANS ON IMPORT CAN KILL THE SUITE THAT IS TESTING IT.
   *
   * Both guards this file imports end in `process.exit(1)` on a violating
   * tree. Without a direct-invocation check that exit runs during the IMPORT,
   * in the vitest worker, and takes the run down with an exit code and no
   * failing test to point at. The two tests above would have "passed" by never
   * running.
   *
   * Spawned rather than reasoned about: the assertion is that importing the
   * module is silent and returns zero, which is the behaviour, not the code.
   */
  it.each([
    'scripts/guards/a-table-a-phone-can-read.mjs',
    'scripts/guards/no-punctuation-standing-in-for-a-value.mjs',
  ])('importing %s scans nothing and exits zero', (guard) => {
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import('./${guard}'); process.stdout.write('imported')`],
      { encoding: 'utf8' },
    )
    expect(out).toBe('imported')
  })

  describe('openingTag', () => {
    /**
     * A className that is a template literal can contain a `>`: the arrow of an
     * inline callback, or a comparison. Scanning for the first `>` would end the
     * tag inside the braces and read half a class list.
     */
    it('does not end the tag on a > inside braces', () => {
      const source = '<table className={`${a > b ? "max-lg:block" : ""} w-full`}>rest'
      expect(openingTag(source, 0)).toBe('<table className={`${a > b ? "max-lg:block" : ""} w-full`}>')
    })

    it('returns the rest of the source when the tag never closes', () => {
      expect(openingTag('<table className="w-full"', 0)).toBe('<table className="w-full"')
    })
  })

  describe('classesOf', () => {
    it('reads a plain string, a template literal, and an expression', () => {
      expect(classesOf('<table className="a b">')).toBe('a b')
      expect(classesOf('<table className={`a ${x}`}>')).toBe('a ${x}')
      expect(classesOf('<table className={cx(a)}>')).toBe('cx(a)')
    })

    it('is empty for a tag with no className at all', () => {
      expect(classesOf('<thead>')).toBe('')
    })
  })
})

/**
 * THE SPACING GUARD READS CODE AND NOT COMMENTS EITHER, which it did not until
 * 21 September 2026.
 *
 * It blocked a build over this sentence in an organiser page's post-mortem,
 * reading `left: "Email"` as a spacing declaration off the 4px scale. The
 * stripping must not make it blinder: the second and third cases pin that a
 * real inline style and a real CSS declaration are still caught.
 */
describe('no-hardcoded-spacing reads code, not comments', () => {
  it('ignores a spacing-shaped phrase inside a comment', () => {
    const source = [
      '/**',
      ' * the left: "Email" measured at x -187 to -47, entirely off the phone.',
      ' */',
      'export const X = 1',
    ].join('\n')
    expect(findViolations(source, 'src/x.tsx')).toEqual([])
  })

  it('still catches a real inline style off the scale', () => {
    const source = `const s = { paddingLeft: '13px' }`
    const found = findViolations(source, 'src/x.tsx') as { kind: string }[]
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('style')
  })

  it('still catches a real stylesheet declaration off the scale', () => {
    const found = findViolations('.a { margin-top: 5px; }', 'src/x.css') as { kind: string }[]
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('css')
  })

  /**
   * THE INTERACTION THE STRIPPING BROKE, AND THE SUITE CAUGHT.
   *
   * The escape hatch `{/* spacing-guard: ignore *␘/}` is itself a comment. The
   * first version of the stripping judged the stripped line AND looked for the
   * marker on the stripped line, so it deleted the marker and then failed the
   * line the marker existed to protect. One test went red and named it.
   */
  it('still honours an ignore marker, which is itself a comment', () => {
    const marker = ['<div className="p-[13px]" />', '{/', '* spacing-guard: ignore *', '/}'].join('')
    expect(findViolations(marker, 'src/x.tsx')).toEqual([])
  })

  it('reports the line the reader will open, not one shifted by the comment above it', () => {
    const source = ['/* a comment', '   spanning three', '   lines */', `const s = { marginTop: '7px' }`].join('\n')
    const found = findViolations(source, 'src/x.tsx') as { line: number }[]
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(4)
  })
})
