/**
 * THE DOCUMENT-WEIGHT ANALYSIS, AND THE ZERO IT MUST NEVER REPORT.
 *
 * `scripts/perf/lib/document-weight.mjs` is a reporter, so it fails a different
 * way from a guard: it does not go red, it prints a number. On 19 September 2026
 * the flight-payload matcher was written with a `\b` that a shell turned into a
 * literal BACKSPACE byte. The expression stayed valid and matched nothing, and
 * "flight payload 0 B (0.0% of the document)" would have gone into a commit
 * message as a fact about this platform.
 *
 * These cases exist for that: every one of them hands the analysis a document
 * whose answer is known by construction, including the empty and the malformed,
 * so a matcher that silently stops matching takes a test red instead of taking
 * a session down a wrong road.
 */
import { describe, expect, it } from 'vitest'
import {
  analyseDocument,
  candidateLists,
  candidateSample,
  catalogueWeight,
  flightPayload,
} from '../../../scripts/perf/lib/document-weight.mjs'

const FLIGHT = '<script>self.__next_f.push([1,"3:[\\"$\\",\\"div\\",null,{}]\\n"])</script>'

describe('flightPayload', () => {
  it('counts the contents of every script tag carrying the marker', () => {
    const html = `<html><body>hello${FLIGHT}${FLIGHT}</body></html>`
    const { bytes, scripts } = flightPayload(html)
    expect(scripts).toBe(2)
    expect(bytes).toBe(2 * (FLIGHT.length - '<script>'.length - '</script>'.length))
  })

  it('does not count a script tag that carries no flight marker', () => {
    expect(flightPayload('<script>console.log(1)</script>').scripts).toBe(0)
  })

  it('does not let one script tag swallow the next', () => {
    const html = `<script>self.__next_f.push([1,"a"])</script><div>x</div><script>plain</script>`
    expect(flightPayload(html).scripts).toBe(1)
  })

  it('matches a script tag carrying attributes', () => {
    expect(flightPayload('<script async="">self.__next_f.push([1,"a"])</script>').scripts).toBe(1)
  })

  it('does NOT match a tag that merely starts with the word script', () => {
    /* The word boundary is the whole reason this case is here: without it the
       matcher is looser than it claims, and with a control character in place
       of it the matcher is tighter than anything can satisfy. */
    expect(flightPayload('<scriptish>self.__next_f.push([1,"a"])</scriptish>').scripts).toBe(0)
  })
})

describe('analyseDocument refuses a vacuous answer', () => {
  it('throws when no script tag carries the flight marker', () => {
    expect(() => analyseDocument('<html><body>no payload here</body></html>')).toThrow(/REFUSING/)
  })

  it('names the harness rather than the platform in the refusal', () => {
    expect(() => analyseDocument('<html></html>')).toThrow(/harness/)
  })

  it('can be asked for a document that genuinely has none, explicitly', () => {
    const r = analyseDocument('<html><body>x</body></html>', { expectFlight: false })
    expect(r.flightBytes).toBe(0)
    expect(r.flightScripts).toBe(0)
  })
})

describe('candidateLists', () => {
  const img = (sizes: string, srcset: string) => `<img sizes="${sizes}" srcset="${srcset}" alt="">`

  it('attributes a candidate list to the sizes in its OWN tag', () => {
    const html = img('280px', 'a 1w, b 2w') + img('100vw', 'c 3w')
    const { byRole, candidates } = candidateLists(html)
    expect(candidates).toBe(3)
    expect(byRole.get('280px')).toMatchObject({ images: 1, candidates: 2 })
    expect(byRole.get('100vw')).toMatchObject({ images: 1, candidates: 1 })
  })

  it('files a tag with a candidate list and no sizes under the fixed-width role', () => {
    const { byRole } = candidateLists('<img srcset="a 1x, b 2x" alt="">')
    expect([...byRole.keys()]).toEqual(['(no sizes: fixed width, x descriptors)'])
  })

  it('counts a preload link, whose attribute Next serves lower-cased', () => {
    const html = '<link rel="preload" imagesizes="100vw" imagesrcset="a 1w, b 2w">'
    expect(candidateLists(html).candidates).toBe(2)
  })

  it('ignores an image with no candidate list at all', () => {
    expect(candidateLists('<img src="a.png" alt="">').candidates).toBe(0)
  })
})

describe('candidateSample', () => {
  it('splits a candidate into the optimiser wrapper and the encoded src', () => {
    const c = '/_next/image?url=https%3A%2F%2Fh.co%2Fa.jpg&w=640&q=80 640w'
    const s = candidateSample(c)
    expect(s?.encodedSrcBytes).toBe('https%3A%2F%2Fh.co%2Fa.jpg'.length)
    expect(s?.decodedSrc).toBe('https://h.co/a.jpg')
    expect(s?.srcSharePercent).toBeGreaterThan(40)
  })

  it('is null when the document carried no candidate list, rather than a zeroed object', () => {
    expect(candidateSample(null)).toBeNull()
  })
})

describe('analyseDocument on a document shaped like the served ones', () => {
  const html =
    '<html><body>' +
    '<img sizes="(min-width: 640px) 280px, 240px" srcset="/_next/image?url=x&w=384&q=80 384w, /_next/image?url=x&w=640&q=80 640w" alt="">' +
    FLIGHT +
    '</body></html>'

  it('reports both the raw and the compressed size, so neither can be quoted alone', () => {
    const r = analyseDocument(html)
    expect(r.documentBytes).toBe(html.length)
    expect(r.gzipBytes).toBeGreaterThan(0)
    expect(r.gzipBytes).toBeLessThan(r.documentBytes)
  })

  it('reports the flight share as a share of the whole document', () => {
    const r = analyseDocument(html)
    expect(r.flightSharePercent).toBeCloseTo((r.flightBytes / html.length) * 100, 6)
  })

  it('orders the roles by cost, biggest first', () => {
    const two =
      '<img sizes="a" srcset="1234567890 1w" alt="">' +
      '<img sizes="b" srcset="1 1w" alt="">' +
      FLIGHT
    expect(analyseDocument(two).byRole.map(r => r.sizes)).toEqual(['a', 'b'])
  })
})

/**
 * THE CATALOGUE MATCHER, WHICH FAILS THE OPPOSITE WAY ROUND FROM EVERYTHING
 * ABOVE IT.
 *
 * `flightPayload` reporting zero is loud: `analyseDocument` throws on it. The
 * catalogue matcher CANNOT throw on zero, because zero is the state the work
 * exists to reach, so a matcher that has silently stopped matching produces the
 * same answer as a platform that is clean. `scripts/guards/
 * no-catalogue-in-every-document.mjs` calibrates itself against a known
 * positive before it judges anything for exactly that reason, and these cases
 * are the other half of it: they pin the shapes the calibration asserts.
 */
describe('catalogueWeight', () => {
  /** A row as it arrives inside a flight chunk: JSON inside a JS string, quotes escaped. */
  const escapedRow = (slug: string) =>
    `{\\"city\\":\\"${slug}\\",\\"slug\\":\\"${slug}\\",\\"latitude\\":-37.8,\\"isLaunchCity\\":true}`
  /** The same row inside a `.rsc` payload, where nothing is escaped. */
  const plainRow = (slug: string) =>
    `{"city":"${slug}","slug":"${slug}","latitude":-37.8,"isLaunchCity":true}`

  it('reads a row in the escaped form a flight chunk carries', () => {
    const r = catalogueWeight(`<script>x ${escapedRow('geelong')} y</script>`, { marker: 'isLaunchCity' })
    expect(r.rows).toBe(1)
    expect(r.distinct).toBe(1)
    expect(r.bySlug).toEqual([['geelong', 1]])
    expect(r.bytes).toBe(escapedRow('geelong').length)
  })

  it('reads the same row unescaped, because an .rsc payload is not inside a string', () => {
    const r = catalogueWeight(plainRow('geelong'), { marker: 'isLaunchCity' })
    expect(r.rows).toBe(1)
    expect(r.bytes).toBe(plainRow('geelong').length)
  })

  it('counts how many WHOLE copies of the catalogue a document carries', () => {
    // The header renders the picker for the desktop bar and again for the
    // mobile sheet, so the real documents carried two. A count of rows alone
    // cannot tell two copies of twenty cities from one copy of forty.
    const two = [escapedRow('melbourne'), escapedRow('geelong'), escapedRow('melbourne'), escapedRow('geelong')].join(',')
    const r = catalogueWeight(two, { marker: 'isLaunchCity' })
    expect(r.rows).toBe(4)
    expect(r.distinct).toBe(2)
    expect(r.copies).toBe(2)
  })

  it('is not anchored on the field ORDER, so reordering a mapper cannot blind it', () => {
    const marked = '{\\"isLaunchCity\\":true,\\"slug\\":\\"hobart\\",\\"city\\":\\"Hobart\\"}'
    const r = catalogueWeight(marked, { marker: 'isLaunchCity' })
    expect(r.rows).toBe(1)
    expect(r.bySlug).toEqual([['hobart', 1]])
  })

  it('counts the flat array form too, which carries no per-row marker', () => {
    const arr = '\\"validSlugs\\":[\\"melbourne\\",\\"geelong\\"]'
    const r = catalogueWeight(arr, { marker: 'isLaunchCity', arrayKeys: ['validSlugs'] })
    expect(r.rows).toBe(0)
    expect(r.arrays).toBe(1)
    expect(r.bytes).toBe(arr.length)
  })

  it('reports zero on a clean document rather than throwing, because zero is the goal', () => {
    const r = catalogueWeight('<html><body>nothing here</body></html>', { marker: 'isLaunchCity' })
    expect(r.bytes).toBe(0)
    expect(r.rows).toBe(0)
    expect(r.copies).toBe(0)
  })

  it('REFUSES when it matches objects it cannot name, because that is the wrong thing counted', () => {
    // The marker is present and no row has a slug: the matcher is reading some
    // other object's field. A byte count attributed to the wrong thing reads as
    // a finding and is not one.
    expect(() =>
      catalogueWeight('{\\"someOther\\":1,\\"isLaunchCity\\":true}', { marker: 'isLaunchCity' }),
    ).toThrow(/REFUSING/)
  })

  it('refuses a call with no marker rather than measuring nothing', () => {
    expect(() => catalogueWeight('anything', {})).toThrow(/needs a marker/)
  })

  it('takes the row itself and not the object wrapping it', () => {
    // The rows arrive inside the props object of a client component, so the
    // enclosing braces are always somebody else's. The scan has to land on the
    // row, or every measurement includes the wrapper and is too big.
    const wrapped = '{\\"cities\\":[{\\"slug\\":\\"perth\\",\\"isLaunchCity\\":true}]}'
    const r = catalogueWeight(wrapped, { marker: 'isLaunchCity' })
    expect(r.rows).toBe(1)
    expect(r.bySlug).toEqual([['perth', 1]])
    expect(r.bytes).toBe('{\\"slug\\":\\"perth\\",\\"isLaunchCity\\":true}'.length)
  })

  it('does not count an object that is not flat, because the scan cannot have bounded it', () => {
    // A nested object AFTER the marker puts the first closing brace inside the
    // nested one, so the slice is not a whole row. Counting it would attribute
    // a partial, arbitrary byte count to the catalogue.
    const notFlat = '{\\"slug\\":\\"perth\\",\\"isLaunchCity\\":true,\\"meta\\":{\\"x\\":1}}'
    expect(catalogueWeight(notFlat, { marker: 'isLaunchCity' }).rows).toBe(0)
  })

  it('reports the share as a share of the whole document', () => {
    const row = escapedRow('perth')
    const html = `<html>${row}</html>`
    const r = catalogueWeight(html, { marker: 'isLaunchCity' })
    expect(r.sharePercent).toBeCloseTo((row.length / html.length) * 100, 6)
  })
})
