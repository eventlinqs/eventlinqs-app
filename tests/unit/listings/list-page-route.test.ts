import { describe, expect, it } from 'vitest'
import { eventPagesFromListPage, pageRuleFor } from '@/lib/listings/page-rules'
import { runCollection, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'

/**
 * THE LIST PAGE ROUTE (WINDOW 2's measure of 1 November 2026, 23:05): forummelbourne.com.au's sitemap lists 39 old
 * shows and none of its current program, which only its own list page carries. So a rule's source may be the site's
 * list page: the run reads the event pages that page links to, under the same rule, robots.txt asked for each, one a
 * second, stopping on a 403 or 429, exactly as it reads a sitemap's.
 */

const GAC = 'https://geelongartscentre.org.au'
const LIST = `${GAC}/whats-on/`
const rule = pageRuleFor(LIST)!

describe('event pages from a list page', () => {
  it('takes the links the rule reads, in page order, each once, made absolute', () => {
    const html = `<main>
      <a href="/whats-on/all-events/first/">First</a>
      <a href="https://geelongartscentre.org.au/whats-on/all-events/second/">Second</a>
      <a href="/whats-on/all-events/first/">First again</a>
      <a href="/about-us/">About</a>
      <a href="https://elsewhere.example.com/whats-on/all-events/x/">Elsewhere</a>
      <a href='/whats-on/all-events/third/?utm=list'>Third</a>
    </main>`
    expect(eventPagesFromListPage(html, LIST, rule)).toEqual([
      `${GAC}/whats-on/all-events/first/`,
      `${GAC}/whats-on/all-events/second/`,
      `${GAC}/whats-on/all-events/third/?utm=list`,
    ])
  })
})

describe('the run reads a rule source through its list page', () => {
  const NOW = new Date('2026-11-01T06:00:00Z')
  const source = {
    id: 'gac-list', name: 'Geelong Arts Centre', pageUrl: LIST, collection: 'read', changes: 'daily', lastCheckedAt: null, lastSuccessAt: null,
    permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, citySlug: 'geelong',
  } as RegisteredSource
  const store: CollectionStore = {
    sources: async () => [source], known: async () => [], heldLinks: async () => new Set(),
    land: async () => true, record: async () => {}, addLinks: async () => {}, logRun: async () => {},
    publishPartnerNight: async () => {}, expirePassed: async () => 0,
  }

  it('robots.txt, the list page, then each event page it links to, a disallowed one never fetched', async () => {
    const asked: string[] = []
    const fetcher: Fetcher = async (url) => {
      asked.push(url)
      if (url === `${GAC}/robots.txt`) return { status: 200, text: async () => 'User-agent: *\nDisallow: /whats-on/all-events/private/' }
      if (url === LIST) return { status: 200, text: async () => `<a href="/whats-on/all-events/one/">1</a><a href="/whats-on/all-events/private/">p</a><a href="/whats-on/all-events/two/">2</a>` }
      return { status: 200, text: async () => '<html><body><p>no show here</p></body></html>' }
    }
    const r = await runCollection(store, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(r.read).toBe(1)
    expect(asked).toEqual([`${GAC}/robots.txt`, LIST, `${GAC}/whats-on/all-events/one/`, `${GAC}/whats-on/all-events/two/`])
  })
})
