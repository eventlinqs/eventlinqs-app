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
