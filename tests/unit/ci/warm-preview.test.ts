/**
 * THE WARM PASS HAS TO FIND THE IMAGE THE AUDIT WILL FETCH.
 *
 * The Lighthouse gate warms the preview before measuring it, and until
 * 25 August 2026 the step called "Warm ISR + the next/image optimiser" curled
 * the PAGE twice. Every optimised image is a separate request to
 * `/_next/image?url=...&w=...&q=...`, each width generated on its first request,
 * so the gate measured a warm page with a cold hero on every run.
 *
 * The first version of the extractor then read `src` and `srcset`
 * case-sensitively and found ONE variant on a page whose markup carries
 * twenty-one, because Next 16 with React 19 serialises the attribute as
 * `srcSet`. That is the negative control below: the old approach on the real
 * markup shape finds nothing, and the shipped one finds all of them.
 */
import { describe, it, expect } from 'vitest'
import { optimisedImageUrls } from '../../../scripts/ci/warm-preview.mjs'

const BASE = 'https://preview.example.vercel.app/events/a-night'

/** The shape Next 16 + React 19 actually emits, capital S and all. */
const REAL_MARKUP = `
<link rel="preload" as="image"
  imageSrcSet="/_next/image?url=https%3A%2F%2Fx.test%2Fa.jpg&amp;w=640&amp;q=75 640w, /_next/image?url=https%3A%2F%2Fx.test%2Fa.jpg&amp;w=1080&amp;q=75 1080w"
  imageSizes="(max-width: 768px) 75vw, 1920px"/>
<img alt="A Night" fetchPriority="high"
  srcSet="/_next/image?url=https%3A%2F%2Fx.test%2Fa.jpg&amp;w=640&amp;q=75 640w, /_next/image?url=https%3A%2F%2Fx.test%2Fa.jpg&amp;w=1920&amp;q=75 1920w"
  src="/_next/image?url=https%3A%2F%2Fx.test%2Fa.jpg&amp;w=1920&amp;q=75"/>
<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" loading="lazy"/>
`

describe('the preview warmer finds every optimised image variant', () => {
  const urls = optimisedImageUrls(REAL_MARKUP, BASE)

  it('finds every distinct width, not just the default src', () => {
    const widths = urls.map(u => new URL(u).searchParams.get('w')).sort()
    expect(widths).toEqual(['1080', '1920', '640'])
  })

  it('reads the preload link, which is the variant the browser fetches first', () => {
    // It is also the LCP candidate, so it is the one whose cold start costs the
    // score. Missing it is missing the point of warming at all.
    expect(urls.some(u => u.includes('w=1080'))).toBe(true)
  })

  it('decodes the HTML entities so the URL requested is the URL rendered', () => {
    // &amp; in markup is & on the wire. A warm request for a literal "&amp;w="
    // is a cache miss against a key nothing will ever ask for again.
    for (const u of urls) expect(u).not.toContain('&amp;')
  })

  it('returns absolute URLs against the page it came from', () => {
    for (const u of urls) expect(u.startsWith('https://preview.example.vercel.app/_next/image')).toBe(true)
  })

  it('ignores a data URI placeholder', () => {
    expect(urls.some(u => u.startsWith('data:'))).toBe(false)
  })

  it('deduplicates, because one width is one cache entry', () => {
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('NEGATIVE CONTROL: the case-sensitive attribute read that shipped finds nothing', () => {
    // This is what the first version did. On the markup above it returns an
    // empty set from srcset, and the only src it finds is the data URI, so the
    // "warm pass" warmed nothing at all while reporting success.
    const oldWay: string[] = []
    for (const m of REAL_MARKUP.matchAll(/\ssrcset="([^"]+)"/g)) oldWay.push(m[1])
    expect(oldWay).toEqual([])
    expect(urls.length).toBe(3)
  })
})
