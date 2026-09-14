import { describe, expect, test } from 'vitest'
import { classifyLine, findGrants, judge, scanTree, ALLOWED_GRANTS } from '../../../scripts/guards/one-priority-image.mjs'

/**
 * ONE PRIORITY IMAGE PER DOCUMENT (close-out C8): a document preloads its LCP
 * candidate and nothing else. The guard recognises a grant, ignores a
 * pass-through, refuses a grant that reaches past the first item, refuses a
 * grant nobody listed, and refuses a list entry that has rotted.
 */
describe('classifyLine', () => {
  test('a literal grant, a bare prop and a first-item expression are grants with reach 1', () => {
    expect(classifyLine('                priority: true,')).toEqual({ expr: 'true', reach: 1 })
    expect(classifyLine('          <HeroMedia image={src} alt="" priority />')).toEqual({ expr: 'true', reach: 1 })
    expect(classifyLine('            <EventCard event={card} priority={firstCardEager && i === 0} />')).toEqual({ expr: 'firstCardEager && i === 0', reach: 1 })
    expect(classifyLine('              priority={idx === 0}')).toEqual({ expr: 'idx === 0', reach: 1 })
    // a grant followed by another attribute on the same line, and a bare prop before one
    expect(classifyLine('        <EventCardMedia src={x} alt={y} priority={true} className={IMG} />')).toEqual({ expr: 'true', reach: 1 })
    expect(classifyLine('        <HeroMedia image={src} priority className="x" />')).toEqual({ expr: 'true', reach: 1 })
  })

  test('a grant that reaches past the first item carries its reach', () => {
    expect(classifyLine('            priority: i < 4,')).toEqual({ expr: 'i < 4', reach: 4 })
    expect(classifyLine('          <CityTile entry={entry} priority={priority && idx < 4} />')?.reach).toBe(4)
    expect(classifyLine('          priority={idx <= 1}')?.reach).toBe(2)
  })

  test('a pass-through, a false, a type and a comment are not grants', () => {
    expect(classifyLine('        priority={priority}')).toBeNull()
    expect(classifyLine('                  priority: t.priority,')).toBeNull()
    expect(classifyLine('        <EventCardMedia src={x} priority={event.priority ?? false} />')).toBeNull()
    expect(classifyLine('        priority: false,')).toBeNull()
    expect(classifyLine('  priority?: boolean')).toBeNull()
    expect(classifyLine('  priority = false,')).toBeNull()
    expect(classifyLine('        fetchPriority={priority ? "high" : "auto"}')).toBeNull()
    expect(classifyLine('  // priority is the LCP candidate')).toBeNull()
    expect(classifyLine('  const x = 1 // priority later')).toBeNull()
  })
})

describe('findGrants and the block comment', () => {
  /*
   * Added 14 September 2026. A comment explaining why a tile is NOT priority
   * quoted the code it replaced, and the guard failed the tree on the
   * quotation, because a line-by-line scanner only skips a line that STARTS
   * like a comment and this codebase does not bullet its JSX comment bodies.
   */
  test('a grant quoted inside a multi-line JSX comment is prose, not a grant', () => {
    const source = [
      '          {/* NOT PRIORITY. The line under this used to read',
      '              `priority: true`, which was a literal standing in for a',
      '              condition that has since become permanently false. */}',
      '          <Tile priority={false} />',
    ].join('\n')
    expect(findGrants(source, 'x.tsx')).toEqual([])
  })

  test('a real grant after the comment closes is still found', () => {
    const source = [
      '          {/* the hero is the LCP',
      '              priority: true is what that means */}',
      '          <HeroMedia image={src} alt="" priority />',
    ].join('\n')
    const grants = findGrants(source, 'x.tsx')
    expect(grants).toHaveLength(1)
    expect(grants[0].line).toBe(3)
  })

  test('a comment opened and closed on one line does not hide the code beside it', () => {
    const source = '          <HeroMedia priority /> /* the LCP */'
    expect(findGrants(source, 'x.tsx')).toHaveLength(1)
  })
})

describe('judge', () => {
  const allowed = [{ file: 'src/a.tsx', match: 'priority={idx === 0}', why: 'the hero' }]

  test('a listed grant passes, an unlisted grant fails, and a rotted list entry fails', () => {
    const ok = findGrants('<Hero priority={idx === 0} />', 'src/a.tsx')
    expect(judge(ok, allowed)).toEqual([])
    const extra = findGrants('<Hero priority={idx === 0} />\n<Tile priority />', 'src/a.tsx')
    expect(judge(extra, allowed).join('\n')).toMatch(/not on the reviewed list/)
    expect(judge([], allowed).join('\n')).toMatch(/no longer matches anything/)
  })

  test('a grant that reaches past the first item fails even when listed', () => {
    const wide = findGrants('<Tile priority={idx < 4} />', 'src/b.tsx')
    const faults = judge(wide, [{ file: 'src/b.tsx', match: 'priority={idx < 4}', why: 'the first row' }])
    expect(faults.join('\n')).toMatch(/first 4 items/)
  })
})

describe('against the real tree', () => {
  test('every priority grant under src is a listed LCP candidate and none reaches past the first item', () => {
    const { files, grants } = scanTree()
    expect(files).toBeGreaterThan(300)
    expect(grants.length).toBe(ALLOWED_GRANTS.length)
    expect(judge(grants)).toEqual([])
  }, 60000)
})
