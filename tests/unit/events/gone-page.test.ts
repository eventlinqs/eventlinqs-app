import { describe, expect, test } from 'vitest'
import { GONE_HEADERS, GONE_STATUS, renderGoneHtml } from '@/lib/events/gone-page'
import { normaliseTyped, typedMatches } from '@/lib/events/typed-confirmation'

describe('the 410 page for a deleted event', () => {
  const html = renderGoneHtml()

  test('is a 410 that no search engine indexes', () => {
    expect(GONE_STATUS).toBe(410)
    expect(GONE_HEADERS['x-robots-tag']).toContain('noindex')
    expect(GONE_HEADERS['content-type']).toContain('text/html')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
  })

  test('says the event has been removed and offers a way onward, in Australian English', () => {
    expect(html).toContain('<html lang="en-AU">')
    expect(html).toContain('This event has been removed')
    expect(html).toContain('href="/events"')
    expect(html).toContain('href="/tickets"')
    // The copy law: no exclamation marks and no dashes in anything a person reads.
    // The doctype's "!" is markup, not copy.
    const copy = html.replace('<!doctype html>', '').replace(/<style>[\s\S]*<\/style>/, '')
    expect(copy).not.toMatch(/!/)
    expect(copy).not.toMatch(/[–—]/)
  })

  test('carries no event title or slug: a deleted draft is not public information', () => {
    expect(html).not.toMatch(/\{\{|\$\{/)
    expect(renderGoneHtml()).toBe(html)
  })

  test('inherits the brand tokens by value: canvas, ink and the gold text tier', () => {
    expect(html).toContain('#FAFAF7')
    expect(html).toContain('#0A1628')
    expect(html).toContain('#6F5409')
    expect(html).toContain('min-height:44px')
  })
})

describe('the typed confirmation', () => {
  test('forgives case and whitespace and nothing else', () => {
    expect(normaliseTyped('  Door   Night 2026 ')).toBe('door night 2026')
    expect(typedMatches('door night 2026', 'Door Night 2026')).toBe(true)
    expect(typedMatches('Door Night 202', 'Door Night 2026')).toBe(false)
    expect(typedMatches('', 'Door Night 2026')).toBe(false)
  })
})
