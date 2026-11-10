import { describe, expect, test } from 'vitest'
import * as port from '../../../scripts/lib/polite-read.mjs'
import { COLLECTOR_AGENT, COLLECTOR_PRODUCT, robotsVerdict } from '../../../src/lib/listings/collect'

/**
 * Law 14 (k)'s polite read for plain node scripts (scripts/lib/polite-read.mjs), held to the platform's own reader:
 * the same agent and the same robots.txt decisions as src/lib/listings/collect.ts on every case below, and the reader's
 * own rules (robots.txt first, one request a second per host, a stop at the first 403 or 429, redirects host by host).
 */

const ROBOTS = [
  '',
  'User-agent: *\nDisallow: /',
  'User-agent: *\nDisallow: /private\nAllow: /private/open',
  'User-agent: EventLinqs\nDisallow: /events\n\nUser-agent: *\nDisallow:',
  'User-agent: Googlebot\nUser-agent: *\nDisallow: /admin # comment\nDisallow: /*.pdf$',
  'User-agent: *\nDisallow: /a*b\nAllow: /a',
  'Sitemap: https://x.example/sitemap.xml\nUser-agent: eventlinqs\nAllow: /\nDisallow: /contact',
]
const PATHS = ['/', '/events', '/events/x', '/private', '/private/open/page', '/admin', '/file.pdf', '/file.pdf?x=1', '/acb', '/a', '/contact', '/contact-us']
const STATUSES: (number | null)[] = [200, 404, 403, 429, 500, null]

describe('one spine: the port decides exactly as collect.ts does', () => {
  test('the same agent and product token', () => {
    expect(port.COLLECTOR_AGENT).toBe(COLLECTOR_AGENT)
    expect(port.COLLECTOR_PRODUCT).toBe(COLLECTOR_PRODUCT)
  })

  test('every robots file, path and status gives the same verdict', () => {
    let cases = 0
    for (const txt of ROBOTS) for (const path of PATHS) for (const status of STATUSES) {
      expect([txt, path, status, port.robotsVerdict(status, txt, path)]).toEqual([txt, path, status, robotsVerdict(status, txt, path)])
      cases += 1
    }
    expect(cases).toBe(ROBOTS.length * PATHS.length * STATUSES.length)
  })
})

type Answer = { status: number; body?: string; location?: string; type?: string }

function network(answers: Record<string, Answer>) {
  const asked: { url: string; at: number }[] = []
  let clock = 0
  const fetchImpl = async (url: string) => {
    asked.push({ url, at: clock })
    const a = answers[url] ?? { status: 404 }
    return {
      status: a.status,
      headers: { get: (h: string) => (h === 'location' ? (a.location ?? null) : h === 'content-type' ? (a.type ?? 'text/html') : null) },
      text: async () => a.body ?? '',
    }
  }
  const lines: string[] = []
  const reader = port.politeReader({
    fetchImpl: fetchImpl as never,
    sleep: async (ms: number) => { clock += ms },
    now: () => clock,
    log: (l: string) => lines.push(l),
  })
  return { reader, asked, lines }
}

describe('the polite reader', () => {
  test('reads robots.txt first, then the page, a second apart on one host', async () => {
    const { reader, asked } = network({ 'https://a.example/robots.txt': { status: 200, body: 'User-agent: *\nDisallow:' }, 'https://a.example/': { status: 200, body: '<p>hi</p>' } })
    const page = await reader('https://a.example/')
    expect(page?.html).toBe('<p>hi</p>')
    expect(asked.map((x) => x.url)).toEqual(['https://a.example/robots.txt', 'https://a.example/'])
    expect(asked[1].at - asked[0].at).toBeGreaterThanOrEqual(1000)
  })

  test('a page robots.txt disallows is never fetched', async () => {
    const { reader, asked, lines } = network({ 'https://b.example/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /contact' } })
    expect(await reader('https://b.example/contact')).toBeNull()
    expect(asked.map((x) => x.url)).toEqual(['https://b.example/robots.txt'])
    expect(lines.join(' ')).toMatch(/robots\.txt does not allow it/)
  })

  test('a host is stopped at its first 403 or 429 for the rest of the run', async () => {
    const { reader, asked } = network({ 'https://c.example/robots.txt': { status: 404 }, 'https://c.example/one': { status: 429 } })
    expect(await reader('https://c.example/one')).toBeNull()
    expect(await reader('https://c.example/two')).toBeNull()
    expect(asked.map((x) => x.url)).toEqual(['https://c.example/robots.txt', 'https://c.example/one'])
  })

  test('a 5xx robots.txt means read nothing', async () => {
    const { reader, asked } = network({ 'https://d.example/robots.txt': { status: 503 } })
    expect(await reader('https://d.example/')).toBeNull()
    expect(asked).toHaveLength(1)
  })

  test('a redirect to another host reads that host\'s robots.txt before its page', async () => {
    const { reader, asked } = network({
      'https://e.example/robots.txt': { status: 404 },
      'https://e.example/': { status: 301, location: 'https://www.f.example/home' },
      'https://www.f.example/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /' },
      'https://www.f.example/home': { status: 200, body: 'home' },
    })
    const page = await reader('https://e.example/')
    expect(page?.url).toBe('https://www.f.example/home')
    expect(asked.map((x) => x.url)).toEqual(['https://e.example/robots.txt', 'https://e.example/', 'https://www.f.example/robots.txt', 'https://www.f.example/home'])
  })

  test('two callers at once are served one after the other, never inside a second on one host', async () => {
    const { reader, asked } = network({ 'https://g.example/robots.txt': { status: 404 }, 'https://g.example/x': { status: 200 }, 'https://g.example/y': { status: 200 } })
    await Promise.all([reader('https://g.example/x'), reader('https://g.example/y')])
    const times = asked.map((x) => x.at)
    for (let i = 1; i < times.length; i += 1) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1000)
  })
})

describe('outreach-basis reads through it', () => {
  test('its pages come from the polite reader, one organiser at a time, never a bare fetch of a page', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('scripts/ops/outreach-basis.mjs', 'utf8').replace(/\r\n/g, '\n')
    expect(src).toContain("import { politeReader } from '../lib/polite-read.mjs'")
    expect(src).toContain('const page = await read(url)')
    expect(src).not.toContain("redirect: 'follow'")
    expect(src).not.toContain('Promise.all([worker(), worker()')
  })
})
