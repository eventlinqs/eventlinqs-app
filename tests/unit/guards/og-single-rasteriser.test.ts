import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  judgeSource,
  judgeSatoriCss,
  drawsThroughRasteriser,
  BANNED,
  RASTERISER,
} from '../../../scripts/guards/og-single-rasteriser.mjs'

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

type Fault = { rule: string; what: string; fix: string; line: number }
const judge = (path: string, source: string): Fault[] => judgeSource(path, source) as Fault[]

/**
 * The guard exists because the same library fault escaped twice: it cost
 * eighteen Launch Kit artefacts on 29 August 2026 and the per-event share card
 * on 6 September, the second time as a DROPPED CONNECTION rather than an error
 * anyone could read. These tests pin what it catches AND the two bugs it shipped
 * with, both of which made it green while two routes imported next/og on line 1.
 */
describe('og-single-rasteriser: what it catches', () => {
  it('catches an import of next/og, which is how the defect came back', () => {
    const faults = judge('src/app/thing.tsx', "import { ImageResponse } from 'next/og'\n")
    expect(faults.map(f => f.rule)).toContain('next-og-import')
    expect(faults[0].line).toBe(1)
  })

  it('catches a run-time import() of next/og, not only a static one', () => {
    const faults = judge('src/app/thing.tsx', "const { ImageResponse } = await import('next/og')\n")
    expect(faults.map(f => f.rule)).toContain('next-og-require')
  })

  it('catches an ImageResponse construction even when the import is aliased away', () => {
    const faults = judge('src/app/thing.tsx', 'const r = new ImageResponse(el, { width: 1 })\n')
    expect(faults.map(f => f.rule)).toContain('image-response')
  })

  it("catches a reach into next's compiled @vercel/og, the way the repro script did", () => {
    const source = "import { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js'\n"
    expect(judge('src/app/thing.tsx', source).map(f => f.rule)).toContain('compiled-og')
  })

  it('reports the true line number of a fault below a licence header', () => {
    const source = `/*\n * a comment\n * another\n */\nimport { ImageResponse } from 'next/og'\n`
    const faults = judge('src/app/thing.tsx', source)
    expect(faults.find(f => f.rule === 'next-og-import')?.line).toBe(5)
  })
})

describe('og-single-rasteriser: what it must NOT catch', () => {
  it('does not trip on a comment explaining why next/og was removed', () => {
    const source = [
      '/**',
      ' * Rasterised through renderOgResponse, NOT next/og: it builds an',
      ' * ImageResponse, and `new ImageResponse(el)` hands satori SVG to sharp.',
      ' */',
      "import { renderOgResponse } from '@/lib/broadcast/og-response'",
      '',
    ].join('\n')
    expect(judge('src/app/thing.tsx', source)).toEqual([])
  })

  it('does not trip on a line comment naming the banned call', () => {
    const source = "// never call new ImageResponse( here\nexport const x = 1\n"
    expect(judge('src/app/thing.tsx', source)).toEqual([])
  })

  it('lets the one rasteriser import satori and resvg, and nobody else', () => {
    const satori = "import satori from 'satori'\nimport { Resvg } from '@resvg/resvg-wasm'\n"
    expect(judge(RASTERISER, satori)).toEqual([])
    const elsewhere = judge('src/lib/broadcast/other.ts', satori).map((f: Fault) => f.rule)
    expect(elsewhere).toContain('satori-direct')
    expect(elsewhere).toContain('resvg-direct')
  })
})

describe('og-single-rasteriser: the two bugs it shipped with', () => {
  /*
   * BUG 1. Every module-specifier rule was matched against stripNonCode output,
   * which blanks string CONTENTS. 'next/og' was blanked out from under the
   * pattern before it ever ran, so the guard reported a clean tree over two
   * routes that both imported next/og on line 1.
   */
  it('matches a module specifier, which only survives the comment-only stripping', () => {
    const specifierRules = BANNED.filter((r: { scan: string }) => r.scan === 'specifier')
    expect(specifierRules.length).toBeGreaterThan(0)
    for (const rule of specifierRules) {
      expect(rule.re.source).toMatch(/next\\\/og|satori|resvg|@vercel\\\/og/)
    }
    // The end-to-end statement of the same bug: this exact line must be caught.
    expect(judge('src/app/x.tsx', "import { ImageResponse } from 'next/og'").length).toBeGreaterThan(0)
  })

  /*
   * BUG 2. judgeSource was handed readSource()'s `{ raw, withStrings, code }`
   * object where it expected a string. It stripped an object, matched nothing,
   * and passed. It now refuses the wrong shape loudly rather than quietly.
   */
  it('refuses the views object instead of silently finding nothing', () => {
    const views = { raw: "import { ImageResponse } from 'next/og'", withStrings: '', code: '' }
    // Deliberately the WRONG shape: this is the call that used to pass silently.
    expect(() => judgeSource('src/app/x.tsx', views as unknown as string)).toThrow(/raw source text/)
  })

  it('every rule declares a scan mode the judge knows', () => {
    for (const rule of BANNED) {
      expect(['code', 'specifier']).toContain(rule.scan)
    }
  })
})

/*
 * THE CSS satori IGNORES. Measured 6 September 2026 with two identical scrims
 * through the real rasteriser: `inset: 0` painted nothing, the four longhand
 * edges painted. Every scrim on every share card and every Launch Kit card used
 * `inset`, so not one of them had ever drawn, on production or anywhere else,
 * and white type sat straight on the organiser's photograph.
 */
describe('og-single-rasteriser: the CSS satori ignores', () => {
  const drawing = (body: string) =>
    `import { renderOgResponse } from '@/lib/broadcast/og-response'\n${body}`

  it('catches the inset shorthand in a file that draws through the rasteriser', () => {
    const faults = judgeSatoriCss('src/app/x.tsx', drawing("const s = { position: 'absolute', inset: 0 }\n")) as Fault[]
    expect(faults).toHaveLength(1)
    expect(faults[0].rule).toBe('satori-inset')
    expect(faults[0].fix).toMatch(/top, right, bottom and left/)
  })

  it('leaves inset alone in ordinary application code, where it is valid CSS', () => {
    const ordinary = "export const cls = { position: 'absolute', inset: 0 }\n"
    expect(judgeSatoriCss('src/components/thing.tsx', ordinary)).toEqual([])
  })

  it('accepts the longhand edges, which is what satori honours', () => {
    const longhand = drawing("const s = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }\n")
    expect(judgeSatoriCss('src/app/x.tsx', longhand)).toEqual([])
  })

  it('does not mistake a longer word ending in inset', () => {
    expect(judgeSatoriCss('src/app/x.tsx', drawing('const boxInset: number = 0\n'))).toEqual([])
  })

  it('knows which files draw through the rasteriser', () => {
    expect(drawsThroughRasteriser("import { renderCardPng } from '@/lib/broadcast/card-raster'")).toBe(true)
    expect(drawsThroughRasteriser("import { renderOgResponse } from '@/lib/broadcast/og-response'")).toBe(true)
    expect(drawsThroughRasteriser("import { useState } from 'react'")).toBe(false)
  })

  it('no satori-drawing file in the tree still uses inset', () => {
    const faults: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        if (entry.isDirectory()) walk(`${dir}/${entry.name}`)
        else if (/\.tsx?$/.test(entry.name)) {
          const rel = `${dir}/${entry.name}`
          for (const f of judgeSatoriCss(rel, read(rel)) as Fault[]) faults.push(`${rel}:${f.line} ${f.what}`)
        }
      }
    }
    walk('src')
    expect(faults).toEqual([])
  })
})

describe('og-single-rasteriser: the tree it guards', () => {
  const appFiles = (): string[] => {
    const out: string[] = []
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const nextRel = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(`${dir}/${entry.name}`, nextRel)
        else if (/\.tsx?$/.test(entry.name)) out.push(`src/app/${nextRel}`)
      }
    }
    walk('src/app', '')
    return out
  }

  it('finds no fault anywhere under src/app, on the real tree', () => {
    const faults = appFiles().flatMap(rel => judge(rel, read(rel)).map(f => `${rel}:${f.line} ${f.what}`))
    expect(faults).toEqual([])
  })

  it('every metadata image route renders through renderOgResponse', () => {
    // Enumerated from disk, never typed from memory: the numbered variants
    // (icon1, icon2, icon3) are a real Next convention and were the three routes
    // the sibling guard could not see at all.
    const metadata = appFiles().filter(rel =>
      /\/(opengraph-image|twitter-image|icon|apple-icon)\d*\.tsx$/.test(rel),
    )
    expect(metadata.length).toBeGreaterThanOrEqual(7)
    for (const rel of metadata) {
      expect(read(rel), `${rel} must render through the platform rasteriser`).toContain('renderOgResponse')
    }
  })

  it('the two per-request share cards hand the renderer a designed fallback', () => {
    for (const rel of [
      'src/app/events/[slug]/opengraph-image.tsx',
      'src/app/api/og/event/[slug]/route.tsx',
    ]) {
      expect(read(rel), `${rel} must degrade to a designed card, never a dead socket`).toContain('fallback:')
    }
  })

  it('neither share card hands satori a URL to fetch', () => {
    for (const rel of [
      'src/app/events/[slug]/opengraph-image.tsx',
      'src/app/api/og/event/[slug]/route.tsx',
    ]) {
      const source = read(rel)
      expect(source, `${rel} must embed the cover`).toContain('fetchImageDataUri')
      expect(source, `${rel} must not pass cover_image_url straight to <img>`).not.toMatch(
        /src=\{\s*event\.cover_image_url\s*\}/,
      )
    }
  })
})
