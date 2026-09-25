import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  judgeFile,
  judgeClipWrappers,
  judgeBorder,
  breakpointOf,
  qualifiedAtOrAbove,
  constantsIn,
  expandClasses,
  openingTag,
  classesOf,
} from '../../../scripts/guards/a-table-a-phone-can-read.mjs'
import {
  ADMIN_CELL_LABEL,
  ADMIN_CELL_LABEL_LIGHT,
  ADMIN_ROW,
  ADMIN_ROW_CONTROL,
  ADMIN_ROW_LIGHT,
  ADMIN_TABLE,
  ADMIN_TABLE_WRAP,
  ADMIN_TABLE_WRAP_LIGHT,
  ADMIN_THEAD,
  ADMIN_THEAD_LIGHT,
} from '@/components/admin/table-card'
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

  /**
   * THE ADMIN CLAUSE, WHICH IS NARROWER ON PURPOSE.
   *
   * An admin table legitimately scrolls: it is a twelve-column operations
   * screen read mostly on a desktop, and `overflow-x-auto` means a finger can
   * still reach the far side of a row. A CLIP cannot be swiped at all, which
   * is why it is the only one enforced there. These cases pin that line, so
   * widening or narrowing it later is a deliberate act with a failing test to
   * change.
   */
  describe('judgeClipWrappers', () => {
    const wrapped = (classes: string) =>
      (judgeClipWrappers(`<div className="${classes}">\n  <table className="w-full">\n    <tbody><tr><td>a</td></tr></tbody>\n  </table>\n</div>`) as unknown[]).length

    it('catches the wrapper that clipped fifty controls on /admin/audit', () => {
      expect(wrapped('overflow-hidden rounded-xl border border-white/[0.08] bg-[#131A2A]')).toBe(1)
    })

    it('leaves a scroller alone, because a finger can move it', () => {
      expect(wrapped('overflow-x-auto rounded-xl border')).toBe(0)
      expect(wrapped('overflow-auto rounded-xl border')).toBe(0)
    })

    it('leaves a clip that only applies from lg up', () => {
      expect(wrapped('lg:overflow-hidden rounded-xl')).toBe(0)
    })

    it('leaves a clip neutralised below lg, which is how a card keeps its corners', () => {
      expect(wrapped('overflow-hidden max-lg:overflow-visible rounded-xl')).toBe(0)
    })

    it('does not reach back past a wrapper into unrelated markup', () => {
      const far = `<div className="overflow-hidden">${'x'.repeat(500)}</div>\n<div className="rounded-xl">\n  <table><tbody><tr><td>a</td></tr></tbody></table>\n</div>`
      expect((judgeClipWrappers(far) as unknown[]).length).toBe(0)
    })

    it('reads code and not the comment explaining the defect', () => {
      const commented = `{/* this box used to be overflow-hidden and clipped fifty controls */}\n<div className="overflow-x-auto">\n  <table><tbody><tr><td>a</td></tr></tbody></table>\n</div>`
      expect((judgeClipWrappers(commented) as unknown[]).length).toBe(0)
    })
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

/**
 * THE ADMIN SCOPE, ADDED 21 SEPTEMBER 2026.
 *
 * The guard grew three things on the day the admin tables were rebuilt, and
 * each of them is a way for a source-reading guard to be quietly wrong:
 *
 *   a DERIVED breakpoint    because /admin/traffic uses `md` and is correct
 *   a CONSTANT resolver     because the classes moved into a shared module and
 *                           the guard started judging the string "ADMIN_TABLE"
 *   a BORDER list           because two of the eighteen files belong to another
 *                           lane, and an exemption that outlives its reason is
 *                           an allowlist
 *
 * The first run of the widened guard failed SIXTEEN correct files for the
 * second of those, which is why the resolver has more cases here than anything
 * else in this file.
 */
describe('a-table-a-phone-can-read, the admin scope', () => {
  describe('breakpointOf', () => {
    it('reads the shared pattern as lg', () => {
      expect(breakpointOf('w-full text-sm max-lg:block', '')).toBe('lg')
    })

    it('reads the /admin/traffic pattern as md, from the rows rather than the table', () => {
      expect(breakpointOf('w-full border-collapse text-sm md:min-w-[40rem]', '<tr className="block md:table-row">')).toBe('md')
    })

    it('is null for a table that stays a table, which is clause ONE failing', () => {
      expect(breakpointOf('w-full text-sm', '<tr className="border-t">')).toBeNull()
    })

    it('does not accept sm, because 640px is still a phone', () => {
      expect(breakpointOf('w-full max-sm:block', '<tr className="block sm:table-row">')).toBeNull()
    })
  })

  describe('qualifiedAtOrAbove', () => {
    it('accepts the same breakpoint and a larger one', () => {
      expect(qualifiedAtOrAbove('md:', 'md')).toBe(true)
      expect(qualifiedAtOrAbove('lg:', 'md')).toBe(true)
    })

    it('refuses a smaller one and an unqualified utility', () => {
      expect(qualifiedAtOrAbove('md:', 'lg')).toBe(false)
      expect(qualifiedAtOrAbove('', 'lg')).toBe(false)
    })
  })

  describe('constantsIn and expandClasses', () => {
    const module_ = [
      "const WRAP_SHAPE = 'rounded-xl lg:overflow-x-auto'",
      'export const ADMIN_TABLE_WRAP = `border border-white/[0.08] ${WRAP_SHAPE}`',
      'export const ADMIN_TABLE = "w-full max-lg:block"',
    ].join('\n')

    it('collects exported and private constants alike', () => {
      const found = constantsIn(module_)
      expect(found.get('ADMIN_TABLE')).toBe('w-full max-lg:block')
      expect(found.has('WRAP_SHAPE')).toBe(true)
    })

    it('resolves a skin composed from a private shape', () => {
      const dict = constantsIn(module_)
      expect(expandClasses('${ADMIN_TABLE_WRAP}', dict)).toBe('border border-white/[0.08] rounded-xl lg:overflow-x-auto')
    })

    it('resolves a className that IS an identifier, which is how a btnClass reaches a call site', () => {
      const dict = constantsIn("const btnClass = 'min-h-11 rounded-md'")
      expect(expandClasses('btnClass', dict)).toBe('min-h-11 rounded-md')
    })

    it('leaves a bare class name alone, because `block` is a class and not a constant', () => {
      const dict = constantsIn("const block = 'never-substitute-me'")
      expect(expandClasses('relative block flex', dict)).toBe('relative block flex')
    })

    it('leaves an unknown reference visible rather than deleting it', () => {
      expect(expandClasses('${NOT_DEFINED} w-full', new Map())).toBe('${NOT_DEFINED} w-full')
    })
  })

  /**
   * THE REGRESSION THAT FAILED SIXTEEN CORRECT FILES, pinned from both sides.
   */
  describe('judging a table whose classes live in a shared constant', () => {
    const CALL_SITE = [
      '<div className={ADMIN_TABLE_WRAP}>',
      '  <table className={`${ADMIN_TABLE} lg:min-w-[720px]`}>',
      '    <thead className={ADMIN_THEAD}><tr><th>Organiser</th></tr></thead>',
      '    <tbody className={ADMIN_TBODY}>',
      '      <tr className={ADMIN_ROW}><td className={ADMIN_CELL_NAME}>a</td></tr>',
      '    </tbody>',
      '  </table>',
      '</div>',
    ].join('\n')
    const shared = new Map<string, string>([
      ['ADMIN_TABLE_WRAP', 'border rounded-xl lg:overflow-x-auto'],
      ['ADMIN_TABLE', 'w-full text-left text-sm max-lg:block'],
      ['ADMIN_THEAD', 'bg-white/[0.03] max-lg:hidden'],
      ['ADMIN_TBODY', 'max-lg:block'],
      ['ADMIN_ROW', 'border-t max-lg:block'],
      ['ADMIN_CELL_NAME', 'px-4 py-3 max-lg:block'],
    ])

    it('passes when the constants are resolved', () => {
      expect((judgeFile(CALL_SITE, shared) as { clause: string }[]).map((f) => f.clause)).toEqual([])
    })

    it('fails when they are not, which is exactly what went wrong', () => {
      expect((judgeFile(CALL_SITE) as { clause: string }[]).map((f) => f.clause)).toContain('phone-presentation')
    })

    it('still sees a clipping wrapper through the constant', () => {
      const clipping = new Map(shared).set('ADMIN_TABLE_WRAP', 'border rounded-xl overflow-hidden')
      expect((judgeClipWrappers(CALL_SITE, clipping) as unknown[]).length).toBe(1)
      expect((judgeClipWrappers(CALL_SITE, shared) as unknown[]).length).toBe(0)
    })
  })

  describe('the /admin/traffic shape, end to end', () => {
    const TRAFFIC = [
      '<div className="relative md:overflow-x-auto">',
      '  <table className="w-full border-collapse text-sm md:min-w-[40rem]">',
      '    <thead className="sr-only md:not-sr-only"><tr><th>Channel</th></tr></thead>',
      '    <tbody>',
      '      <tr className="block border-t py-4 md:table-row md:py-0">',
      '        <td className="flex md:table-cell">12</td>',
      '      </tr>',
      '    </tbody>',
      '  </table>',
      '</div>',
    ].join('\n')

    it('passes: cards at md, an md-qualified scroller, and an sr-only header', () => {
      expect((judgeFile(TRAFFIC) as { clause: string }[]).map((f) => f.clause)).toEqual([])
    })

    it('fails the moment its scroller stops being md-qualified', () => {
      const bad = TRAFFIC.replace('relative md:overflow-x-auto', 'relative overflow-x-auto')
      expect((judgeFile(bad) as { clause: string }[]).map((f) => f.clause)).toContain('overflow')
    })
  })

  describe('judgeBorder', () => {
    const entry = { file: 'src/app/admin/(authed)/pricing/page.tsx', why: 'lane B owns pricing configuration' }

    it('is earned while the file still violates', () => {
      expect(judgeBorder(entry, 4)).toBeNull()
    })

    it('refuses once the owning lane has paid it', () => {
      expect(judgeBorder(entry, 0)).toContain('delete its entry')
    })

    it('refuses when the file it names has gone', () => {
      expect(judgeBorder(entry, null)).toContain('no longer holds a table')
    })
  })

  /**
   * THE SHARED MODULE'S OWN CONTRACT.
   *
   * Sixteen admin tables render these exact strings, so a character removed
   * here is a regression on sixteen screens. The drills cover the same ground
   * against the real guard; these assert the constants themselves, which is the
   * cheaper half and the one that names the missing utility.
   */
  describe('src/components/admin/table-card.ts', () => {
    it('stops the table being a table below lg', () => {
      expect(ADMIN_TABLE).toContain('max-lg:block')
    })

    it('hides the column headings where every cell carries its own', () => {
      expect(ADMIN_THEAD).toContain('max-lg:hidden')
      expect(ADMIN_THEAD_LIGHT).toContain('max-lg:hidden')
    })

    it('keeps the label visible only below lg, where the heading has gone', () => {
      expect(ADMIN_CELL_LABEL).toContain('lg:hidden')
      expect(ADMIN_CELL_LABEL_LIGHT).toContain('lg:hidden')
    })

    it('never turns on a horizontal scroller below lg', () => {
      for (const wrap of [ADMIN_TABLE_WRAP, ADMIN_TABLE_WRAP_LIGHT]) {
        expect(wrap).toContain('lg:overflow-x-auto')
        expect(wrap).not.toMatch(/(?:^|\s)overflow-x-auto(?=\s|$)/)
      }
    })

    it('carries the 44px floor the guard accepts by name', () => {
      expect(ADMIN_ROW_CONTROL).toContain('min-h-11')
    })

    it('draws the card on both skins, so neither is invisible on its own surface', () => {
      expect(ADMIN_ROW).toContain('max-lg:bg-[#131A2A]')
      expect(ADMIN_ROW_LIGHT).toContain('max-lg:bg-white')
    })
  })
})
