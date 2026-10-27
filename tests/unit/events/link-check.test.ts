// The daily link check (src/lib/events/link-check.ts; the project manager's 12:30, point 5). Pinned: RFC 9309's group
// choice and longest match, an allow winning a tie, 4xx robots allowing and 5xx or unreachable disallowing; a page's own
// Event data read for its availability and price; 404 and 410 dead; and nothing changed on a blink, a login wall or a
// page with no Event data.

import { describe, expect, test } from 'vitest'
import { checkLink, readPage, robotsAllows, robotsRules, type CheckDeps } from '@/lib/events/link-check'

describe('robots.txt, by RFC 9309', () => {
  const txt = ['User-agent: *', 'Disallow: /private', 'Allow: /private/events', '', 'User-agent: OtherBot', 'Disallow: /'].join('\n')

  test('the "*" group when none names us, longest match winning', () => {
    const rules = robotsRules(txt)
    expect(robotsAllows(rules, '/events/beavs')).toBe(true)
    expect(robotsAllows(rules, '/private/admin')).toBe(false)
    expect(robotsAllows(rules, '/private/events/beavs')).toBe(true)
  })

  test('our own group over the "*" group, matched without regard to case', () => {
    const rules = robotsRules(`${txt}\n\nUser-agent: eventlinqslinkcheck\nDisallow: /events\n`)
    expect(robotsAllows(rules, '/events/beavs')).toBe(false)
    expect(robotsAllows(rules, '/private/admin')).toBe(true)
  })

  test('an allow wins a tie, and a wildcard and an end anchor are read', () => {
    expect(robotsAllows(robotsRules('User-agent: *\nDisallow: /e\nAllow: /e\n'), '/e/x')).toBe(true)
    expect(robotsAllows(robotsRules('User-agent: *\nDisallow: /*.php$\n'), '/tickets.php')).toBe(false)
    expect(robotsAllows(robotsRules('User-agent: *\nDisallow: /*.php$\n'), '/tickets.php?x=1')).toBe(true)
  })
})

describe('what a page says about itself', () => {
  const page = (offers: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'MusicEvent', name: 'Beavs Trivia', offers })}</script></head></html>`

  test('gone at 404 or 410', () => {
    expect(readPage(404, '')).toEqual({ availability: 'dead', priceFromCents: null })
    expect(readPage(410, '')).toEqual({ availability: 'dead', priceFromCents: null })
  })

  test('its own Event data: sold out, not yet, on sale, and the lowest Australian dollar price', () => {
    expect(readPage(200, page({ availability: 'https://schema.org/SoldOut', price: 35, priceCurrency: 'AUD' }))).toEqual({ availability: 'sold_out', priceFromCents: 3500 })
    expect(readPage(200, page({ availability: 'https://schema.org/PreSale' })).availability).toBe('not_yet')
    expect(readPage(200, page([{ availability: 'SoldOut', price: 50 }, { availability: 'https://schema.org/InStock', lowPrice: '22.50', priceCurrency: 'AUD' }]))).toEqual({ availability: 'on_sale', priceFromCents: 2250 })
    expect(readPage(200, page({ availability: 'https://schema.org/InStock', price: 20, priceCurrency: 'USD' })).priceFromCents).toBeNull()
  })

  test('nothing from a server error, a page with no Event data, or broken structured data', () => {
    expect(readPage(503, '')).toEqual({ availability: null, priceFromCents: null })
    expect(readPage(200, '<html><body>Log in to continue</body></html>')).toEqual({ availability: null, priceFromCents: null })
    expect(readPage(200, '<script type="application/ld+json">{broken</script>')).toEqual({ availability: null, priceFromCents: null })
  })
})

describe('one link checked', () => {
  const site = (pages: Record<string, { status: number; body: string } | null>): CheckDeps & { asked: string[] } => {
    const asked: string[] = []
    return {
      asked,
      get: async (url) => {
        asked.push(url)
        return url in pages ? pages[url] : { status: 404, body: '' }
      },
    }
  }
  const SOLD = `<script type="application/ld+json">{"@type":"Event","offers":{"availability":"https://schema.org/SoldOut"}}</script>`

  test('reads robots.txt once per host, then the page, and says what changed', async () => {
    const deps = site({ 'https://tix.example.com/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /\n' }, 'https://tix.example.com/e/1': { status: 200, body: SOLD }, 'https://tix.example.com/e/2': { status: 410, body: '' } })
    const cache = new Map()
    expect(await checkLink('https://tix.example.com/e/1', deps, cache)).toEqual({ changed: true, availability: 'sold_out', priceFromCents: null })
    expect(await checkLink('https://tix.example.com/e/2', deps, cache)).toEqual({ changed: true, availability: 'dead', priceFromCents: null })
    expect(deps.asked.filter((u) => u.endsWith('/robots.txt'))).toHaveLength(1)
  })

  test('leaves a link as it was where robots forbids it, robots.txt answers 5xx or cannot be reached', async () => {
    for (const robots of [{ status: 200, body: 'User-agent: *\nDisallow: /e\n' }, { status: 503, body: '' }, null]) {
      const deps = site({ 'https://tix.example.com/robots.txt': robots, 'https://tix.example.com/e/1': { status: 200, body: SOLD } })
      expect(await checkLink('https://tix.example.com/e/1', deps, new Map())).toEqual({ changed: false, why: 'robots' })
      expect(deps.asked).not.toContain('https://tix.example.com/e/1')
    }
  })

  test('reads freely where robots.txt answers 4xx, and changes nothing when the page cannot be reached', async () => {
    const deps = site({ 'https://tix.example.com/robots.txt': { status: 404, body: '' }, 'https://tix.example.com/e/1': null })
    expect(await checkLink('https://tix.example.com/e/1', deps, new Map())).toEqual({ changed: false, why: 'unknown' })
    expect(deps.asked).toContain('https://tix.example.com/e/1')
  })
})
