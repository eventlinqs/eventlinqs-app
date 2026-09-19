import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARTIST_FLAG,
  ARTIST_READER,
  artistBlockIsFlagGated,
  blockRangeAfter,
  flagTestOffsets,
} from '../../../scripts/guards/lib/artist-sitemap-gate.mjs'
import { stripComments } from '../../../scripts/lib/js-source.mjs'

/**
 * CLAUSE F OF `sitemap-resolves`, the static half of the artist sitemap family.
 *
 * The comparison guard MODELS the flag gate in `src/app/sitemap.ts` because it
 * cannot execute that file. This clause holds the file so the model cannot
 * drift, and these cases are what make the clause itself trustworthy: a guard
 * nobody has seen refuse is a guard nobody has tested.
 */

const GATED = [
  'export default async function sitemap() {',
  '  const entries = []',
  '  try {',
  "    if (await isFeatureEnabled('broadcast_artists')) {",
  '      const artistCatalogue = await readArtistCatalogue()',
  '      for (const row of artistCatalogue.rows) entries.push(row)',
  '    }',
  '  } catch (err) {',
  '    report(err)',
  '  }',
  '  return entries',
  '}',
].join('\n')

describe('artistBlockIsFlagGated', () => {
  it('accepts the shape the sitemap actually uses', () => {
    const verdict = artistBlockIsFlagGated(GATED)
    expect(verdict.gated).toBe(true)
    expect(verdict.reason).toContain('1 artist read(s)')
  })

  it('REFUSES the call once the flag test is deleted, which is the drift it exists for', () => {
    const ungated = GATED.replace("if (await isFeatureEnabled('broadcast_artists')) {", 'if (true) {')
    const verdict = artistBlockIsFlagGated(ungated)
    expect(verdict.gated).toBe(false)
    expect(verdict.reason).toContain('OFF ON PRODUCTION')
  })

  it('REFUSES a call that sits after the gated block rather than inside it', () => {
    const outside = [
      "if (await isFeatureEnabled('broadcast_artists')) {",
      '  noteTheFlag()',
      '}',
      'const artistCatalogue = await readArtistCatalogue()',
    ].join('\n')
    expect(artistBlockIsFlagGated(outside).gated).toBe(false)
  })

  it('REFUSES the family disappearing altogether, because a silent absence is the defect on record', () => {
    const verdict = artistBlockIsFlagGated('export default async function sitemap() { return [] }')
    expect(verdict.gated).toBe(false)
    expect(verdict.reason).toContain('no longer calls')
  })

  it('requires EVERY call to be gated, not merely one of them', () => {
    const one = GATED.replace('  return entries', '  const second = await readArtistCatalogue()\n  return entries')
    expect(artistBlockIsFlagGated(one).gated).toBe(false)
  })

  it('is not fooled by a different flag being tested', () => {
    const wrongFlag = GATED.replace(ARTIST_FLAG, 'broadcast_follow')
    expect(artistBlockIsFlagGated(wrongFlag).gated).toBe(false)
  })

  /**
   * THE CLAUSE IS JUDGED AGAINST THE REAL FILE, not only against fixtures.
   *
   * A pure function that passes six invented strings and refuses the shipped
   * sitemap would be a clause that fails the build on day one, and a fixture
   * cannot notice that. This reads what actually ships.
   */
  it('accepts the sitemap that is actually in the tree', () => {
    const src = stripComments(readFileSync(join(process.cwd(), 'src/app/sitemap.ts'), 'utf8'))
    const verdict = artistBlockIsFlagGated(src)
    expect(verdict.gated, verdict.reason).toBe(true)
  })
})

describe('blockRangeAfter', () => {
  it('finds the block a flag test opens, and its matching close', () => {
    const src = 'if (x) { a() }'
    const range = blockRangeAfter(src, 0)
    expect(src.slice(range!.open, range!.close + 1)).toBe('{ a() }')
  })

  it('counts nesting rather than stopping at the first close', () => {
    const src = 'if (x) { if (y) { a() } b() }'
    const range = blockRangeAfter(src, 0)
    expect(src.slice(range!.open, range!.close + 1)).toBe('{ if (y) { a() } b() }')
  })

  it('returns null when a block is never opened', () => {
    expect(blockRangeAfter('const a = 1', 0)).toBeNull()
  })

  it('returns null on an unterminated block rather than guessing an end', () => {
    expect(blockRangeAfter('if (x) { a()', 0)).toBeNull()
  })
})

describe('flagTestOffsets', () => {
  it('finds every positive test of the artist flag', () => {
    const src = `a(isFeatureEnabled('${ARTIST_FLAG}')) b(isFeatureEnabled('${ARTIST_FLAG}'))`
    expect(flagTestOffsets(src)).toHaveLength(2)
  })

  it('finds none when the flag is not tested', () => {
    expect(flagTestOffsets("isFeatureEnabled('broadcast_share')")).toEqual([])
  })
})

describe('the constants the clause pins', () => {
  it('names the flag the route itself gates on', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/artists/[slug]/page.tsx'), 'utf8')
    expect(route).toContain(ARTIST_FLAG)
  })

  it('names the reader the catalogue module exports', () => {
    const catalogue = readFileSync(join(process.cwd(), 'src/lib/seo/sitemap-catalogue.ts'), 'utf8')
    expect(catalogue).toContain(`export async function ${ARTIST_READER.replace('(', '')}`)
  })
})
