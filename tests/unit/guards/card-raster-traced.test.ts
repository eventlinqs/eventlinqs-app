import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FONTS_MODULE,
  NEXT_CONFIG,
  RASTER_MODULE,
  coversFonts,
  fontsFrom,
  isSubtreeEntry,
  judgeRoutes,
  judgeTraces,
  nextTools,
  normalisePattern,
  parseTracingIncludes,
  reachers,
  reachingRoutes,
  resolveSourceImport,
  routeEntryName,
  runtimeImports,
  traceFileCandidates,
  traceFileFor,
  wasmPathFrom,
} from '../../../scripts/guards/card-raster-traced.mjs'

/**
 * THE RASTERISER'S BINARY REACHES EVERY LAMBDA THAT NEEDS IT, OR THE BUILD FAILS.
 *
 * Close-out C3 (6 September 2026). A local server reads node_modules directly,
 * so nothing short of a deployed lambda can show a lost tracing entry, and the
 * eighteen cards have answered 500 that way once already. The guard derives the
 * reaching routes from the import graph and judges them with Next's own matcher;
 * each piece of that reading is pinned here on the shapes that matter.
 */

const ROOT = join(__dirname, '..', '..', '..')

describe('runtimeImports', () => {
  test('keeps static, side-effect, re-export, dynamic and require specifiers', () => {
    const code = [
      "import a from '@/lib/a'",
      "import { b, c } from './b'",
      "import * as ns from '../c'",
      "import '@/lib/side-effect'",
      "export { d } from '@/lib/d'",
      "export * from '@/lib/e'",
      "const f = await import('@/lib/f')",
      "const g = require('@/lib/g')",
    ].join('\n')
    expect(runtimeImports(code)).toEqual([
      '@/lib/a', './b', '../c', '@/lib/d', '@/lib/e', '@/lib/side-effect', '@/lib/f', '@/lib/g',
    ])
  })

  test('elides type-only imports, which pull nothing into a lambda', () => {
    const code = [
      "import type { SocialCardInput } from '@/lib/broadcast/social-cards'",
      "import type Foo from '@/lib/foo'",
      "import { type A, type B } from '@/lib/types-only'",
      "export type { Bar } from '@/lib/bar'",
      "import { type A, real } from '@/lib/mixed'",
    ].join('\n')
    expect(runtimeImports(code)).toEqual(['@/lib/mixed'])
  })

  test('handles a multi-line named import', () => {
    const code = "import {\n  prepareCardCover,\n  renderSocialCard,\n} from '@/lib/broadcast/social-cards'\n"
    expect(runtimeImports(code)).toEqual(['@/lib/broadcast/social-cards'])
  })
})

describe('resolveSourceImport', () => {
  const tree = new Set([
    'src/lib/a.ts',
    'src/lib/b/index.tsx',
    'src/lib/broadcast/card-raster.ts',
    'src/app/api/x/route.ts',
    'src/lib/env/manifest.mjs',
  ])
  const exists = (p: string) => tree.has(p)

  test('maps the @/ alias onto src/ and completes the extension', () => {
    expect(resolveSourceImport('@/lib/a', 'src/app/api/x/route.ts', exists)).toBe('src/lib/a.ts')
    expect(resolveSourceImport('@/lib/b', 'src/app/api/x/route.ts', exists)).toBe('src/lib/b/index.tsx')
    expect(resolveSourceImport('@/lib/env/manifest.mjs', 'src/lib/a.ts', exists)).toBe('src/lib/env/manifest.mjs')
  })

  test('resolves a relative specifier from the importing file', () => {
    expect(resolveSourceImport('../../../lib/a', 'src/app/api/x/route.ts', exists)).toBe('src/lib/a.ts')
    expect(resolveSourceImport('../../lib/a', 'src/app/api/x/route.ts', exists)).toBeNull()
    expect(resolveSourceImport('./card-raster', 'src/lib/broadcast/social-cards.tsx', exists)).toBe('src/lib/broadcast/card-raster.ts')
  })

  test('ignores packages, builtins and anything that escapes src/', () => {
    expect(resolveSourceImport('satori', 'src/lib/a.ts', exists)).toBeNull()
    expect(resolveSourceImport('node:fs', 'src/lib/a.ts', exists)).toBeNull()
    expect(resolveSourceImport('../../../scripts/x', 'src/lib/a/b.ts', exists)).toBeNull()
    expect(resolveSourceImport('@/lib/missing', 'src/lib/a.ts', exists)).toBeNull()
  })
})

describe('reachers', () => {
  test('walks the reverse graph transitively, through a dynamic hop', () => {
    const edges = new Map<string, Set<string>>([
      ['route', new Set(['action'])],
      ['action', new Set(['cover'])],
      ['cover', new Set(['raster'])],
      ['unrelated', new Set(['x'])],
      ['raster', new Set()],
    ])
    expect([...reachers(edges, 'raster')].sort()).toEqual(['action', 'cover', 'route'])
  })
})

describe('route entries', () => {
  test('names the Next entry for pages, routes and image routes, and nothing else', () => {
    expect(routeEntryName('src/app/(dashboard)/dashboard/events/create/page.tsx')).toBe('app/(dashboard)/dashboard/events/create/page')
    expect(routeEntryName('src/app/api/organiser/events/[id]/card/[format]/route.ts')).toBe('app/api/organiser/events/[id]/card/[format]/route')
    expect(routeEntryName('src/app/events/[slug]/opengraph-image.tsx')).toBe('app/events/[slug]/opengraph-image')
    expect(routeEntryName('src/app/admin/(authed)/health/page.tsx')).toBe('app/admin/(authed)/health/page')
    expect(routeEntryName('src/app/actions/lineup.ts')).toBeNull()
    expect(routeEntryName('src/lib/broadcast/social-cards.tsx')).toBeNull()
    expect(routeEntryName('src/components/launch-kit/post-pack.tsx')).toBeNull()
  })

  /*
   * The NUMBER SUFFIX convention, added 6 September 2026 (close-out C3).
   *
   * "You can set multiple icons by adding a number suffix to the file name. For
   * example, icon1.png, icon2.png" - the installed Next documentation at
   * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md:64.
   *
   * Without it this guard could not see src/app/icon1.tsx, icon2.tsx or
   * icon3.tsx at all: three real routes, one of them the maskable icon the
   * installed PWA uses, invisible to a guard whose whole job is to enumerate
   * every route that reaches the rasteriser.
   */
  test('sees the numbered metadata images, which are a real Next convention', () => {
    expect(routeEntryName('src/app/icon1.tsx')).toBe('app/icon1')
    expect(routeEntryName('src/app/icon2.tsx')).toBe('app/icon2')
    expect(routeEntryName('src/app/icon3.tsx')).toBe('app/icon3')
    expect(routeEntryName('src/app/apple-icon2.tsx')).toBe('app/apple-icon2')
    expect(routeEntryName('src/app/opengraph-image1.tsx')).toBe('app/opengraph-image1')
  })

  test('a number suffix does not turn an ordinary module into a route', () => {
    expect(routeEntryName('src/app/lib/helper2.ts')).toBeNull()
    expect(routeEntryName('src/app/page2.tsx')).toBeNull()
    expect(routeEntryName('src/app/route7.ts')).toBeNull()
  })

  test('the three numbered icons exist on disk and are seen', () => {
    for (const n of [1, 2, 3]) {
      const rel = `src/app/icon${n}.tsx`
      expect(existsSync(join(ROOT, rel)), `${rel} must exist for this test to mean anything`).toBe(true)
      expect(routeEntryName(rel)).toBe(`app/icon${n}`)
    }
  })

  test('a layout or template governs a subtree', () => {
    expect(isSubtreeEntry('src/app/(dashboard)/dashboard/layout.tsx')).toBe(true)
    expect(isSubtreeEntry('src/app/template.tsx')).toBe(true)
    expect(isSubtreeEntry('src/app/page.tsx')).toBe(false)
  })
})

describe('reading the config and the modules', () => {
  test('parses keys and values out of an outputFileTracingIncludes block, comments stripped', () => {
    const config = `
      const nextConfig = {
        // '/decoy': ['./in-a-comment'],
        outputFileTracingIncludes: {
          '/': ['./src/lib/dev/home-seed-fixture.json'],
          /* a block comment with '/another': ['x'] inside */
          '/api/organiser/events/[id]/card/[format]': [
            './src/assets/fonts/*.ttf',
            // the binary
            './node_modules/@resvg/resvg-wasm/index_bg.wasm',
          ],
          "/admin/health": ["node_modules\\\\@resvg\\\\resvg-wasm\\\\index_bg.wasm"],
        },
        async redirects() { return [] },
      }`
    const map = parseTracingIncludes(config)
    expect([...map.keys()]).toEqual(['/', '/api/organiser/events/[id]/card/[format]', '/admin/health'])
    expect(map.get('/api/organiser/events/[id]/card/[format]')).toEqual([
      'src/assets/fonts/*.ttf',
      'node_modules/@resvg/resvg-wasm/index_bg.wasm',
    ])
    expect(map.get('/admin/health')).toEqual(['node_modules/@resvg/resvg-wasm/index_bg.wasm'])
  })

  test('a config with no block is an error, not an empty map', () => {
    expect(() => parseTracingIncludes('const nextConfig = {}')).toThrow(/declares no outputFileTracingIncludes/)
  })

  test('normalisePattern reads ./ and backslashes the way Next does', () => {
    expect(normalisePattern('./node_modules/x')).toBe('node_modules/x')
    expect(normalisePattern('node_modules\\x\\y')).toBe('node_modules/x/y')
    // As it appears in the config SOURCE: an escaped backslash is one separator.
    expect(normalisePattern('node_modules\\\\x\\\\y')).toBe('node_modules/x/y')
  })

  test('reads the binary path out of card-raster.ts and the fonts out of card-fonts.ts, from the real tree', () => {
    const wasm = wasmPathFrom(readFileSync(join(ROOT, RASTER_MODULE), 'utf8'))
    expect(wasm).toBe('node_modules/@resvg/resvg-wasm/index_bg.wasm')
    const fonts = fontsFrom(readFileSync(join(ROOT, FONTS_MODULE), 'utf8'))
    expect(fonts.dir).toBe('src/assets/fonts')
    expect(fonts.files.length).toBeGreaterThanOrEqual(4)
    expect(fonts.files).toContain('Archivo-Bold.ttf')
  })

  test('a rasteriser that stops declaring its path fails the guard loudly rather than passing it', () => {
    expect(() => wasmPathFrom('const nothing = 1')).toThrow(/WASM_RELATIVE/)
    expect(() => fontsFrom('const nothing = 1')).toThrow(/FONT_DIR/)
  })

  test('coversFonts accepts a glob under the directory or every file by name, and nothing looser', () => {
    const fonts = { dir: 'src/assets/fonts', files: ['A.ttf', 'B.ttf'] }
    expect(coversFonts(['src/assets/fonts/*.ttf'], fonts)).toBe(true)
    expect(coversFonts(['src/assets/fonts/A.ttf', 'src/assets/fonts/B.ttf'], fonts)).toBe(true)
    expect(coversFonts(['src/assets/fonts/A.ttf'], fonts)).toBe(false)
    expect(coversFonts(['src/assets/*.ttf'], fonts)).toBe(false)
    expect(coversFonts([], fonts)).toBe(false)
  })
})

describe('judgeRoutes, with Next\'s own normaliser and matcher', () => {
  const wasm = 'node_modules/@resvg/resvg-wasm/index_bg.wasm'
  const fonts = { dir: 'src/assets/fonts', files: ['A.ttf'] }
  const { normalise, match } = nextTools(ROOT)

  test('a bracketed key matches its own dynamic route, and a grouped page matches its ungrouped key', () => {
    const includes = new Map([
      ['/api/organiser/events/[id]/card/[format]', ['src/assets/fonts/*.ttf', wasm]],
      ['/dashboard/events/create', [wasm, 'src/assets/fonts/*.ttf']],
    ])
    const routes = [
      { file: 'src/app/api/organiser/events/[id]/card/[format]/route.ts', entry: 'app/api/organiser/events/[id]/card/[format]/route', subtree: false, needsFonts: true },
      { file: 'src/app/(dashboard)/dashboard/events/create/page.tsx', entry: 'app/(dashboard)/dashboard/events/create/page', subtree: false, needsFonts: true },
    ]
    const { faults, passes } = judgeRoutes(routes, includes, match, normalise, wasm, fonts)
    expect(faults).toEqual([])
    expect(passes).toHaveLength(2)
  })

  test('a route with no matching key, and a route whose key lacks the fonts, are both faults that name the route', () => {
    const includes = new Map([['/admin/health', [wasm]]])
    const routes = [
      { file: 'src/app/api/cron/health-heartbeat/route.ts', entry: 'app/api/cron/health-heartbeat/route', subtree: false, needsFonts: true },
      { file: 'src/app/admin/(authed)/health/page.tsx', entry: 'app/admin/(authed)/health/page', subtree: false, needsFonts: true },
    ]
    const { faults } = judgeRoutes(routes, includes, match, normalise, wasm, fonts)
    expect(faults).toHaveLength(2)
    expect(faults[0]).toMatch(/health-heartbeat.*pin lacks '\.\/node_modules\/@resvg\/resvg-wasm\/index_bg\.wasm' and '\.\/src\/assets\/fonts\/\*\.ttf'.*no outputFileTracingIncludes key matches it/)
    expect(faults[1]).toMatch(/admin\/health.*pin lacks '\.\/src\/assets\/fonts\/\*\.ttf'.*keys applied: \/admin\/health/)
  })

  test('a route that needs no fonts passes on the binary alone', () => {
    const includes = new Map([['/api/x', [wasm]]])
    const routes = [{ file: 'src/app/api/x/route.ts', entry: 'app/api/x/route', subtree: false, needsFonts: false }]
    expect(judgeRoutes(routes, includes, match, normalise, wasm, fonts).faults).toEqual([])
  })

  test('a layout that reaches the rasteriser is a fault to resolve by hand', () => {
    const routes = [{ file: 'src/app/(dashboard)/dashboard/layout.tsx', entry: 'app/(dashboard)/dashboard/layout', subtree: true, needsFonts: true }]
    const { faults } = judgeRoutes(routes, new Map(), match, normalise, wasm, fonts)
    expect(faults).toHaveLength(1)
    expect(faults[0]).toMatch(/governs every route beneath it/)
  })

  test('the committed next.config.ts is readable by the guard', () => {
    const map = parseTracingIncludes(readFileSync(join(ROOT, NEXT_CONFIG), 'utf8'))
    expect(map.size).toBeGreaterThan(0)
    for (const [key, values] of map) {
      expect(key.startsWith('/'), `key ${key}`).toBe(true)
      expect(values.length, `values for ${key}`).toBeGreaterThan(0)
    }
  })
})

describe('judgeTraces, the postbuild proof on the traces Next wrote', () => {
  const wasm = 'node_modules/@resvg/resvg-wasm/index_bg.wasm'
  const fonts = { dir: 'src/assets/fonts', files: ['A.ttf', 'B.ttf'] }
  const create = { file: 'src/app/(dashboard)/dashboard/events/create/page.tsx', entry: 'app/(dashboard)/dashboard/events/create/page', subtree: false, needsFonts: true }
  const cron = { file: 'src/app/api/cron/health-heartbeat/route.ts', entry: 'app/api/cron/health-heartbeat/route', subtree: false, needsFonts: false }
  const full = ['../../../../../../../node_modules/@resvg/resvg-wasm/index_bg.wasm', '../../../../../../../src/assets/fonts/A.ttf', '../../../../../../../src/assets/fonts/B.ttf', '../../../../../../../node_modules/satori/dist/index.js']

  test('names the trace file the way Next lays it out', () => {
    expect(traceFileFor(create.entry)).toBe('.next/server/app/(dashboard)/dashboard/events/create/page.js.nft.json')
  })

  test('a trace that carries the binary and every font passes, by suffix, whatever the relative prefix', () => {
    const { faults, passes } = judgeTraces([create, cron], () => full, wasm, fonts)
    expect(faults).toEqual([])
    expect(passes).toHaveLength(2)
    expect(passes[0]).toMatch(/4 traced files carry the binary and 2 fonts/)
  })

  test('a trace without the binary is a fault that names the route and the file', () => {
    const { faults } = judgeTraces([create], () => full.filter((f) => !f.endsWith('index_bg.wasm')), wasm, fonts)
    expect(faults).toHaveLength(1)
    expect(faults[0]).toMatch(/create\/page\.js\.nft\.json \(3 files\) lacks node_modules\/@resvg\/resvg-wasm\/index_bg\.wasm/)
    expect(faults[0]).toMatch(/would answer 500 on every card/)
  })

  test('a trace missing one font names that font, and a route that needs no fonts is not held to them', () => {
    const noB = full.filter((f) => !f.endsWith('B.ttf'))
    expect(judgeTraces([create], () => noB, wasm, fonts).faults[0]).toMatch(/lacks src\/assets\/fonts\/B\.ttf/)
    expect(judgeTraces([cron], () => noB, wasm, fonts).faults).toEqual([])
  })

  test('a route the build wrote no trace for is a fault, not a pass', () => {
    const { faults } = judgeTraces([create], () => null, wasm, fonts)
    expect(faults).toHaveLength(1)
    expect(faults[0]).toMatch(/no trace was written for/)
  })

  /*
   * BOTH TRACE SHAPES, added 6 September 2026 (close-out C3). A metadata image
   * is compiled into a route handler of its own, so Next writes its trace at
   * <entry>/route.js.nft.json. Reading only <entry>.js.nft.json made seven real
   * traces look like seven absences.
   */
  test('finds the trace a metadata image actually gets', () => {
    expect(traceFileCandidates('app/icon')).toEqual([
      '.next/server/app/icon.js.nft.json',
      '.next/server/app/icon/route.js.nft.json',
    ])
  })

  test('reads the metadata-image shape when the page shape is absent', () => {
    const seen: string[] = []
    const readTrace = (f: string) => {
      seen.push(f)
      return f.endsWith('/route.js.nft.json') ? full : null
    }
    const image = { entry: 'app/icon', file: 'src/app/icon.tsx', needsFonts: true, subtree: false }
    const { faults, passes } = judgeTraces([image], readTrace, wasm, fonts)
    expect(faults).toEqual([])
    expect(passes).toHaveLength(1)
    expect(seen).toEqual(['.next/server/app/icon.js.nft.json', '.next/server/app/icon/route.js.nft.json'])
  })

  test('no trace in either place names both places it looked', () => {
    const image = { entry: 'app/icon', file: 'src/app/icon.tsx', needsFonts: true, subtree: false }
    const { faults } = judgeTraces([image], () => null, wasm, fonts)
    expect(faults).toHaveLength(1)
    expect(faults[0]).toMatch(/looked for .*app\/icon\.js\.nft\.json or .*app\/icon\/route\.js\.nft\.json/)
  })

  test('against the real build output, when one exists, every reaching route carries both', () => {
    if (!existsSync(join(ROOT, '.next', 'server'))) return
    const { routes } = reachingRoutes(ROOT)
    const wasmReal = wasmPathFrom(readFileSync(join(ROOT, RASTER_MODULE), 'utf8'))
    const fontsReal = fontsFrom(readFileSync(join(ROOT, FONTS_MODULE), 'utf8'))
    const readTrace = (traceFile: string) => {
      const p = join(ROOT, traceFile)
      return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')).files as string[]) : null
    }
    const { faults } = judgeTraces(routes, readTrace, wasmReal, fontsReal)
    expect(faults).toEqual([])
  })
})
