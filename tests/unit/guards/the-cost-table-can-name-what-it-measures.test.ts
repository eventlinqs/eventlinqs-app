import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  FEATURE_MARKERS,
  UNATTRIBUTED,
  nameChunk,
  parseClientReferenceManifest,
  summariseModules,
} from '../../../scripts/perf/lib/chunk-attribution.mjs'
import { judgeBuilt, judgeContract } from '../../../scripts/guards/the-cost-table-can-name-what-it-measures.mjs'

/**
 * WHAT A CHUNK SERVES, AND THE TWO WAYS THE ANSWER WAS WRONG.
 *
 * The guard is drilled red and green against the real tree
 * (scripts/verify/guard-failure-drills.mjs). These cases pin the JUDGEMENT on
 * inputs a drill cannot produce: a manifest whose shape has changed, a chunk
 * two markers both claim, and the exact row the cost table printed wrong for a
 * week while a correct answer sat in a module it was not importing.
 */

const TABLE_READS_THE_LIBRARY = "import { nameChunk } from './lib/chunk-attribution.mjs'\nconst x = 1\n"

describe('chunk attribution: the build\'s own answer', () => {
  describe('parseClientReferenceManifest', () => {
    it('reads the assignment Next actually writes', () => {
      const source =
        'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n' +
        'globalThis.__RSC_MANIFEST["/page"] = {"clientModules":{"[project]/src/a.tsx":{"chunks":["/_next/static/chunks/aa.js"]}}}'
      const parsed = parseClientReferenceManifest(source) as { clientModules: Record<string, unknown> }
      expect(Object.keys(parsed.clientModules)).toEqual(['[project]/src/a.tsx'])
    })

    /**
     * THE FAILURE THE BUILT CLAUSE EXISTS FOR. A framework version that changes
     * this shape blinds the table silently, so the parser must report it rather
     * than throw it: one unreadable route must not take the whole run down, and
     * the guard counts what it returns.
     */
    it('returns null rather than throwing when the shape has changed', () => {
      expect(parseClientReferenceManifest('globalThis.__RSC_MANIFEST["/page"] = notJson;')).toBeNull()
      expect(parseClientReferenceManifest('nothing like a manifest at all')).toBeNull()
    })
  })

  describe('summariseModules', () => {
    it('leads with our own file, never with node_modules', () => {
      const label = summariseModules(
        new Set([
          '[project]/node_modules/next/dist/client/app-dir/link.js',
          '[project]/src/components/features/events/event-form.tsx',
        ]),
      )
      expect(label).toBe('src/components/features/events/event-form.tsx +1 more')
    })

    it('names a lone module without a count', () => {
      expect(summariseModules(new Set(['[project]/src/app/error.tsx']))).toBe('src/app/error.tsx')
    })

    it('falls back to the dependency when the chunk holds nothing of ours', () => {
      expect(summariseModules(new Set(['[project]/node_modules/next/dist/client/script.js']))).toBe(
        'node_modules/next/dist/client/script.js',
      )
    })

    it('says unattributed for an empty set rather than an empty string', () => {
      expect(summariseModules(new Set())).toBe(UNATTRIBUTED)
    })
  })

  describe('nameChunk', () => {
    it('names the chunk by the manifest when nothing in it is a known library', () => {
      expect(
        nameChunk({ file: 'aa.js', body: 'nothing recognisable', modules: new Set(['[project]/src/components/home/hero.tsx']) }),
      ).toEqual({ label: 'src/components/home/hero.tsx', how: 'manifest' })
    })

    /**
     * THE MISLABEL THAT LASTED ONE COMMIT. Manifest-first called the 21 KB
     * Lucide runtime `src/app/(dashboard)/dashboard/error.tsx +145 more`,
     * because that path sorts first among its 146 consumers, and would have
     * sent a reader working down the table to the dashboard error boundary to
     * find out why the homepage ships 8 KB. A marker says what a chunk IS; a
     * manifest says which of our modules need it, and for a shared vendor chunk
     * those are not the same sentence.
     */
    it('names a shared vendor chunk by what it is, and says how far it reaches', () => {
      const named = nameChunk({
        file: '2-ib05yrjrspw.js',
        body: 'lucide',
        modules: new Set(['[project]/src/app/(dashboard)/dashboard/error.tsx', '[project]/src/components/home/hero.tsx']),
      })
      expect(named).toEqual({ label: 'Lucide icons (needed by 2 client module(s))', how: 'marker' })
    })

    it('prefers a fact the build states outright over anything inferred', () => {
      expect(nameChunk({ file: 'poly.js', body: 'whatever', known: 'legacy polyfill bundle (noModule)' })).toEqual({
        label: 'legacy polyfill bundle (noModule)',
        how: 'build',
      })
    })

    /**
     * THE EXACT ROW THE COST TABLE PRINTED WRONG, on all thirteen gated routes,
     * for the week between the shared list naming this chunk correctly and the
     * table starting to read that list.
     */
    it('names the App Router runtime by the header name that survives minification', () => {
      expect(nameChunk({ file: '1khqh8u91m-_x.js', body: 'e.set("next-router-state-tree",t)' })).toEqual({
        label: 'Next.js App Router runtime',
        how: 'marker',
      })
    })

    it('names the Turbopack runtime by its file name when nothing in it matches', () => {
      expect(nameChunk({ file: 'turbopack-abc.js', body: 'nothing recognisable' })).toEqual({
        label: 'Turbopack runtime',
        how: 'marker',
      })
    })

    it('says so plainly when it cannot name a chunk', () => {
      expect(nameChunk({ file: 'zz.js', body: 'nothing recognisable' })).toEqual({ label: UNATTRIBUTED, how: 'none' })
    })

    it('joins every marker that matched rather than picking one', () => {
      const named = nameChunk({ file: 'zz.js', body: '__reactContainer and NEXT_HTTP_ERROR_FALLBACK together' })
      expect(named.label).toBe('React DOM + Next.js error boundaries')
    })
  })
})

describe('the-cost-table-can-name-what-it-measures, contract mode', () => {
  it('passes the list and the table the platform actually ships', () => {
    expect(judgeContract(FEATURE_MARKERS, TABLE_READS_THE_LIBRARY)).toEqual([])
  })

  /**
   * THE ONE THAT WAS REALLY THERE. The cost table kept a private copy of the
   * markers made before the shared module existed, and that copy still held
   * three markers the shared module had already recorded as dead.
   */
  it('refuses a cost table that does not read the shared library', () => {
    expect(judgeContract(FEATURE_MARKERS, 'const x = 1\n').join(' ')).toContain('does not read')
  })

  it('refuses a cost table that declares its own marker list again', () => {
    const withCopy = `${TABLE_READS_THE_LIBRARY}const FEATURE_MARKERS = [{ feature: 'x', test: /y/ }]\n`
    expect(judgeContract(FEATURE_MARKERS, withCopy).join(' ')).toContain('declares its own FEATURE_MARKERS')
  })

  it('reads code and not the comment that explains the defect', () => {
    const commented = `${TABLE_READS_THE_LIBRARY}/* the list used to be a const FEATURE_MARKERS = [...] right here */\n`
    expect(judgeContract(FEATURE_MARKERS, commented)).toEqual([])
  })

  it('refuses a marker with no regular expression', () => {
    const broken = [{ feature: 'ghost' }, ...FEATURE_MARKERS]
    expect(judgeContract(broken, TABLE_READS_THE_LIBRARY).join(' ')).toContain('no regular expression')
  })

  /**
   * A marker matching the empty string claims every chunk in the build, which
   * reads as complete coverage and is completely wrong. `/x?/` does it by
   * accident, which is why the clause is a test and not a convention.
   */
  it('refuses a marker that would claim every chunk', () => {
    const broken = [{ feature: 'everything', test: /x?/ }, ...FEATURE_MARKERS]
    expect(judgeContract(broken, TABLE_READS_THE_LIBRARY).join(' ')).toContain('EMPTY STRING')
  })

  it('refuses two markers claiming one feature name', () => {
    const broken = [...FEATURE_MARKERS, { feature: 'React DOM', test: /whatever/ }]
    expect(judgeContract(broken, TABLE_READS_THE_LIBRARY).join(' ')).toContain('both claim the feature')
  })

  it('refuses an empty list, which would name nothing at all', () => {
    expect(judgeContract([], TABLE_READS_THE_LIBRARY).join(' ')).toContain('exports no markers')
  })

  /**
   * A GUARD THAT SCANS ON IMPORT CAN KILL THE SUITE THAT IS TESTING IT.
   * Spawned rather than reasoned about.
   */
  it('imports without scanning and exits zero', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./scripts/guards/the-cost-table-can-name-what-it-measures.mjs'); process.stdout.write('imported')",
      ],
      { encoding: 'utf8' },
    )
    expect(out).toBe('imported')
  })
})

/**
 * THE BUILT CLAUSES, against a `.next` built for the test rather than by Next.
 *
 * The real failure was proven against the real build on 21 September 2026 by
 * corrupting one manifest in `.next`, watching the guard exit 1 naming that
 * file, and restoring the bytes (recorded in C:\dev\BUILD-LOG-C.md). That is
 * not repeatable in a suite, because the suite does not own a build and must
 * never mutate one. These cases do the other half: the arithmetic, on a tree
 * small enough to write.
 */
describe('the-cost-table-can-name-what-it-measures, built mode', () => {
  const make = (
    manifests: { route: string; modules: Record<string, string[]> }[],
    chunks: string[],
  ): string => {
    const root = mkdtempSync(join(tmpdir(), 'lane-c-next-'))
    const chunkDir = join(root, 'static', 'chunks')
    mkdirSync(chunkDir, { recursive: true })
    for (const chunk of chunks) writeFileSync(join(chunkDir, chunk), 'nothing recognisable in here')
    for (const manifest of manifests) {
      const dir = join(root, 'server', 'app', manifest.route)
      mkdirSync(dir, { recursive: true })
      const clientModules = Object.fromEntries(
        Object.entries(manifest.modules).map(([module_, files]) => [
          module_,
          { chunks: files.map((f) => `/_next/static/chunks/${f}`) },
        ]),
      )
      writeFileSync(
        join(dir, 'page_client-reference-manifest.js'),
        `globalThis.__RSC_MANIFEST["/${manifest.route}"] = ${JSON.stringify({ clientModules })}`,
      )
    }
    return root
  }

  it('skips cleanly when there is no build, so a contract run is never a false green', () => {
    const empty = mkdtempSync(join(tmpdir(), 'lane-c-empty-'))
    const { skipped, findings } = judgeBuilt(empty) as { skipped: string | null; findings: string[] }
    expect(skipped).toContain('no build on disk')
    expect(findings).toEqual([])
  })

  it('passes a build whose manifests name most of the chunks', () => {
    const root = make(
      [{ route: 'page', modules: { '[project]/src/a.tsx': ['a.js', 'b.js', 'c.js'] } }],
      ['a.js', 'b.js', 'c.js', 'd.js'],
    )
    const { findings } = judgeBuilt(root) as { findings: string[] }
    expect(findings).toEqual([])
  })

  /**
   * THE COLLAPSE THIS CLAUSE EXISTS FOR: the manifests still parse, so nothing
   * throws, and they have simply stopped naming anything. The table carries on
   * printing confident rows off the markers alone.
   */
  it('refuses a build whose manifests have stopped naming chunks', () => {
    const root = make(
      [{ route: 'page', modules: { '[project]/src/a.tsx': ['a.js'] } }],
      ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'],
    )
    const { findings } = judgeBuilt(root) as { findings: string[] }
    expect(findings.join(' ')).toContain('1 of 5')
    expect(findings.join(' ')).toContain('floor 60%')
  })

  it('names the manifest that stopped parsing rather than reporting a total', () => {
    const root = make([{ route: 'page', modules: { '[project]/src/a.tsx': ['a.js'] } }], ['a.js'])
    writeFileSync(
      join(root, 'server', 'app', 'page', 'page_client-reference-manifest.js'),
      'globalThis.__RSC_MANIFEST["/page"] = notJsonAnyMore;',
    )
    const { findings } = judgeBuilt(root) as { findings: string[] }
    expect(findings.join(' ')).toContain('did not parse')
    expect(findings.join(' ')).toContain('page_client-reference-manifest.js')
  })
})
