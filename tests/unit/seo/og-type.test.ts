import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_OG_TYPE, EVENT_PAGE_OG_TYPE, eventOpenGraph } from '@/lib/seo/og-type'

/**
 * og:type ON EVENT PAGES (close-out SEO5 step 7), the named acceptance test
 * `og_type_is_event_on_event_pages`.
 *
 * ============================================================================
 * WHY THIS TEST READS THE PAGE FILE AS WELL AS THE CONSTANT
 * ============================================================================
 *
 * Asserting `EVENT_PAGE_OG_TYPE === 'event'` on its own would prove only that a
 * constant has a value. The claim in the acceptance line is about the PAGE, and
 * a page that stopped calling `eventOpenGraph` would keep this constant correct
 * while shipping `website` to every share card. So the page file is read and the
 * wiring is asserted: it composes its Open Graph block through the one helper
 * and does not declare a literal type of its own.
 *
 * A driven proof would be stronger still and is not free here: Next resolves
 * `generateMetadata` at request time, so reading the served HTML needs a server
 * and an event. That is what `scripts/verify/seo5-states-drive.mjs` does, and it
 * asserts the rendered `<meta property="og:type">` on a real lane-C event page.
 * This test is the cheap half that fails in milliseconds when the wiring goes.
 */

const EVENT_PAGE = join(process.cwd(), 'src', 'app', 'events', '[slug]', 'page.tsx')

describe('og_type_is_event_on_event_pages', () => {
  it('the decided value is event, not the site-level default', () => {
    expect(EVENT_PAGE_OG_TYPE).toBe('event')
    expect(EVENT_PAGE_OG_TYPE).not.toBe(DEFAULT_OG_TYPE)
  })

  it('the Open Graph block carries NO type key, which is what lets the page emit one', () => {
    /*
     * THIS ASSERTION EXISTS BECAUSE THE OBVIOUS IMPLEMENTATION CRASHED THE PAGE.
     *
     * `openGraph: { type: 'event' as never }` compiles, passes every test, and
     * throws at RENDER time: Next switches on the value and its default arm
     * raises `Invalid OpenGraph type: event`, so the event page rendered "We hit
     * a snag loading this page" at every viewport. Next emits the tag only
     * `if ('type' in og)`, so the key must be ABSENT, not undefined, for the
     * page's own meta tag to be the only one.
     */
    const block = eventOpenGraph({
      title: 'Lane C proof night',
      description: 'A night',
      url: 'https://eventlinqs.com.au/events/lane-c-proof-night',
    })
    expect('type' in block).toBe(false)
    expect((block as { title?: string }).title).toBe('Lane C proof night')
  })

  it('the event page composes its Open Graph through that helper', () => {
    const source = readFileSync(EVENT_PAGE, 'utf8')
    expect(source).toContain('openGraph: eventOpenGraph({')
  })

  it('the event page renders the meta tag itself, with property and not name', () => {
    const page = readFileSync(EVENT_PAGE, 'utf8')
    expect(page).toContain('<EventOpenGraphTypeMeta />')
    // Comments stripped first: the file's own prose explains why `name=` is
    // wrong, and a naive search would find that explanation and call it the
    // defect. The first version of this assertion did exactly that.
    const component = readFileSync(
      join(process.cwd(), 'src', 'components', 'seo', 'og-type-meta.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(component).toContain('property="og:type"')
    // `metadata.other` renders `name=`, which the protocol and Meta's crawler
    // both ignore. A tag under the wrong attribute is not a tag.
    expect(component).not.toContain('name="og:type"')
  })

  it('the event page declares no og:type literal of its own', () => {
    // The defect this catches is a later edit adding `type: 'website'` back
    // beside the helper call, which would win or would confuse the next reader.
    const source = readFileSync(EVENT_PAGE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(source).not.toMatch(/type:\s*'website'/)
  })
})

describe('the value is one word to change, which is why it is a constant', () => {
  it('is declared in exactly one place in src', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'seo', 'og-type.ts'), 'utf8')
    const declarations = source.match(/export const EVENT_PAGE_OG_TYPE/g) ?? []
    expect(declarations).toHaveLength(1)
  })

  it('records the crash that decided HOW it is emitted, not only WHAT', () => {
    // The next person to read this will reach for `openGraph.type` first. The
    // file has to stop them before they ship it.
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'seo', 'og-type.ts'), 'utf8')
    expect(source).toContain('Invalid OpenGraph type: event')
  })

  it('carries the citations that reversed the decision, in the file itself', () => {
    // Law 7: the research lives beside the claim it supports, not only in a
    // handover note that the next reader will not have.
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'seo', 'og-type.ts'), 'utf8')
    expect(source).toContain('https://ogp.me/')
    expect(source).toContain('https://developers.facebook.com/docs/sharing/webmasters')
    expect(source).toContain('events.event')
  })
})
