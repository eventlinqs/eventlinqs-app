import { describe, expect, test } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COMPLETIONS, SRC_ROOT, completeSourcePath, sourceTarget } from '../../../scripts/lib/src-alias-loader.mjs'

/**
 * A SCRIPT CAN READ THE PRODUCT'S OWN LISTS, OR IT RE-TYPES THEM.
 *
 * Close-out C3 (6 September 2026). The Launch Kit inspection loads the card
 * formats and the artefact channels from src/lib/broadcast through a resolve
 * hook rather than copying them. The two rules the hook applies are pinned
 * here with an injected filesystem, and once against the real tree.
 */

const ROOT = join(__dirname, '..', '..', '..')

describe('sourceTarget', () => {
  const parent = pathToFileURL(join(SRC_ROOT, 'lib', 'broadcast', 'social-card-layout.ts')).href

  test('maps the @/ alias under src/', () => {
    expect(sourceTarget('@/lib/broadcast/social-card-spec', parent, SRC_ROOT)).toBe(
      join(SRC_ROOT, 'lib', 'broadcast', 'social-card-spec'),
    )
  })

  test('resolves a relative specifier against its importer, inside src/ only', () => {
    expect(sourceTarget('./social-card-spec', parent, SRC_ROOT)).toBe(join(SRC_ROOT, 'lib', 'broadcast', 'social-card-spec'))
    expect(sourceTarget('../../../scripts/x', parent, SRC_ROOT)).toBeNull()
  })

  test('leaves packages and builtins to Node', () => {
    expect(sourceTarget('sharp', parent, SRC_ROOT)).toBeNull()
    expect(sourceTarget('node:fs', parent, SRC_ROOT)).toBeNull()
    expect(sourceTarget('./x', undefined, SRC_ROOT)).toBeNull()
  })
})

describe('completeSourcePath', () => {
  test('tries the omitted extensions in order, then an index file', () => {
    const files = new Set(['/s/a.ts', '/s/b.tsx', '/s/c/index.ts', '/s/d.mjs'])
    const exists = (p: string) => files.has(p.replace(/\\/g, '/'))
    expect(completeSourcePath('/s/a', exists)).toBe('/s/a.ts')
    expect(completeSourcePath('/s/b', exists)).toBe('/s/b.tsx')
    expect(completeSourcePath('/s/c', exists)?.replace(/\\/g, '/')).toBe('/s/c/index.ts')
    expect(completeSourcePath('/s/d', exists)).toBe('/s/d.mjs')
    expect(completeSourcePath('/s/missing', exists)).toBeNull()
    expect(COMPLETIONS[0]).toBe('.ts')
  })

  test('an explicit existing path is returned as is', () => {
    const exists = (p: string) => p === '/s/a.ts'
    expect(completeSourcePath('/s/a.ts', exists)).toBe('/s/a.ts')
  })

  test('against the real tree, the pure broadcast modules complete to their .ts files', () => {
    const isFile = (p: string) => existsSync(p) && statSync(p).isFile()
    for (const m of ['social-card-spec', 'social-card-layout', 'artefact-channels']) {
      expect(completeSourcePath(join(ROOT, 'src', 'lib', 'broadcast', m), isFile)).toBe(
        join(ROOT, 'src', 'lib', 'broadcast', `${m}.ts`),
      )
    }
  })
})
