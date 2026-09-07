import { describe, expect, test } from 'vitest'
import { lcpElement, median, renderTable, scriptBytes, summarise } from '../../../scripts/ci/lighthouse-truth-table.mjs'

/**
 * THE TRUTH TABLE PRINTS MEDIANS, NAMES THE LCP ELEMENT, AND SAYS WHEN IT CANNOT.
 *
 * Close-out C8 CORRECTED (7 September 2026): the gate reported a best-of-three
 * category score and nothing else. This reporter prints the typical run and the
 * parts that make it, per URL, as a markdown table. The shapes below are the
 * ones Lighthouse writes: an errored largest-contentful-paint-element audit is
 * what 12.1.0 produced in every report; the list-of-tables shape is 12.6.1's.
 */
const run = (url: string, perf: number, lcp: number, tbt: number, cls: number, script: number, element: unknown, version = '12.6.1') => ({
  lighthouseVersion: version,
  finalDisplayedUrl: url,
  configSettings: { formFactor: 'mobile' },
  categories: { performance: { score: perf } },
  audits: {
    'largest-contentful-paint': { numericValue: lcp },
    'total-blocking-time': { numericValue: tbt },
    'cumulative-layout-shift': { numericValue: cls },
    'resource-summary': { details: { items: [{ resourceType: 'total', transferSize: script + 100_000 }, { resourceType: 'script', transferSize: script }] } },
    'largest-contentful-paint-element': element,
  },
})

const namedElement = {
  scoreDisplayMode: 'informative',
  details: {
    type: 'list',
    items: [
      { type: 'table', items: [{ node: { type: 'node', selector: 'section.hero > img', nodeLabel: 'A crowd at dusk', snippet: '<img class="hero-raster" src="/hero.avif">' } }] },
      { type: 'table', items: [{ phase: 'TTFB', timing: 400 }] },
    ],
  },
}
const erroredElement = { scoreDisplayMode: 'error', errorMessage: "Dependency RootCauses failed: Cannot read properties of undefined (reading 'frame_sequence')" }

describe('median', () => {
  test('odd and even counts, non-numbers ignored, empty is null', () => {
    expect(median([0.72, 0.74, 0.71])).toBe(0.72)
    expect(median([1, 4, 2, 3])).toBe(2.5)
    expect(median([2, undefined as unknown as number, 1])).toBe(1.5)
    expect(median([])).toBeNull()
  })
})

describe('lcpElement', () => {
  test('names the selector, the label and the snippet when Lighthouse has them', () => {
    const text = lcpElement({ audits: { 'largest-contentful-paint-element': namedElement } })
    expect(text).toContain('section.hero > img')
    expect(text).toContain('A crowd at dusk')
    expect(text).toContain('hero-raster')
  })

  test('says plainly when the audit errored, with the message, instead of guessing', () => {
    const text = lcpElement({ audits: { 'largest-contentful-paint-element': erroredElement } })
    expect(text).toContain('not reported')
    expect(text).toContain('audit errored')
    expect(text).toContain('RootCauses')
  })

  test('says when the audit is absent from the report', () => {
    expect(lcpElement({ audits: {} })).toContain('audit absent')
  })

  test('falls back to the Lighthouse 13 LCP insight, whose list carries the element as a node item', () => {
    const insight = {
      scoreDisplayMode: 'informative',
      details: {
        type: 'list',
        items: [
          { type: 'table', items: [{ subpart: 'timeToFirstByte', duration: 350 }] },
          { type: 'node', lhId: 'page-8-IMG', selector: 'div.w-[220px] > a.flex > div.relative > img.card-media-img', snippet: '<img alt="Browse events by community" fetchpriority="high">' },
        ],
      },
    }
    const text = lcpElement({ audits: { 'lcp-breakdown-insight': insight } })
    expect(text).toContain('img.card-media-img')
    expect(text).toContain('Browse events by community')
  })
})

describe('scriptBytes', () => {
  test('reads the script row of resource-summary and is null without it', () => {
    expect(scriptBytes(run('https://x/', 0.8, 1, 1, 0, 433_000, namedElement))).toBe(433_000)
    expect(scriptBytes({ audits: {} })).toBeNull()
  })
})

describe('summarise and renderTable', () => {
  const lhrs = [
    run('https://p.example/events/x', 0.72, 3_600, 420, 0.01, 440_000, namedElement),
    run('https://p.example/events/x', 0.74, 3_400, 380, 0.0, 430_000, namedElement),
    run('https://p.example/events/x', 0.71, 3_900, 450, 0.02, 450_000, namedElement),
    run('https://p.example/', 0.66, 4_200, 800, 0.0, 400_000, erroredElement, '12.1.0'),
    run('https://p.example/', 0.76, 3_900, 700, 0.0, 400_000, erroredElement, '12.1.0'),
    run('https://p.example/', 0.75, 4_000, 750, 0.0, 400_000, erroredElement, '12.1.0'),
  ]

  test('one row per URL, medians not best runs, sorted by path', () => {
    const rows = summarise(lhrs)
    expect(rows.map((r) => r.path)).toEqual(['/', '/events/x'])
    const home = rows[0]
    expect(home.runs).toBe(3)
    expect(home.perfMedian).toBe(0.75)
    expect(home.perfMin).toBe(0.66)
    expect(home.perfMax).toBe(0.76)
    expect(home.lcpMs).toBe(4_000)
    expect(home.tbtMs).toBe(750)
    expect(home.lcpElement).toContain('audit errored')
    const event = rows[1]
    expect(event.perfMedian).toBe(0.72)
    expect(event.lcpMs).toBe(3_600)
    expect(event.tbtMs).toBe(420)
    expect(event.cls).toBe(0.01)
    expect(event.scriptBytes).toBe(440_000)
    expect(event.lcpElement).toContain('section.hero > img')
  })

  test('renders a markdown table a person can paste, with the spread beside the median', () => {
    const table = renderTable(summarise(lhrs))
    const lines = table.split('\n')
    expect(lines[0]).toContain('| URL | runs | performance (median, spread) | LCP | TBT | CLS | script | LCP element |')
    expect(lines[1]).toMatch(/^\|---/)
    expect(lines[2]).toContain('| / | 3 | 75 (66 to 76) |')
    expect(lines[2]).toContain('4,000 ms')
    expect(lines[2]).toContain('750 ms')
    expect(lines[3]).toContain('| /events/x | 3 | 72 (71 to 74) |')
    expect(lines[3]).toContain('430 KB')
    expect(lines[3]).toContain('section.hero > img')
  })
})
