import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor } from '@/lib/listings/page-rules'

/**
 * THE NEWEST PAGES FIRST (WINDOW 2's measure of 1 November 2026, 23:05): hermaj.com's sitemap lists its 145 event
 * pages oldest first and eurekacentreballarat.com.au's its 237, so a run that reads the first 200 in sitemap order
 * never reaches the Eureka Centre's newest 37, its current program. The reader takes the newest first: by lastmod where
 * every page carries one, else from the end of the list, where a site that appends its new shows puts them.
 */

const GAC = 'https://geelongartscentre.org.au'
const rule = pageRuleFor(`${GAC}/sitemaps-1-section-event-1-sitemap.xml`)!
const page = (n: number) => `${GAC}/whats-on/all-events/show-${n}/`

describe('event pages from a sitemap, newest first', () => {
  it('reads every page by its lastmod, newest first, when every page carries one', () => {
    const xml = `<urlset>
      <url><loc>${page(1)}</loc><lastmod>2025-03-01</lastmod></url>
      <url><loc>${page(2)}</loc><lastmod>2026-10-30T10:00:00+11:00</lastmod></url>
      <url><loc>${page(3)}</loc><lastmod>2026-06-15</lastmod></url>
    </urlset>`
    expect(eventPagesFromSitemap(xml, rule)).toEqual([page(2), page(3), page(1)])
  })

  it('reads from the end of the list when lastmod is missing anywhere, the newest a site appends', () => {
    const xml = `<urlset>
      <url><loc>${page(1)}</loc></url>
      <url><loc>${page(2)}</loc><lastmod>2026-10-30</lastmod></url>
      <url><loc>${page(3)}</loc></url>
    </urlset>`
    expect(eventPagesFromSitemap(xml, rule)).toEqual([page(3), page(2), page(1)])
  })

  it('a capped read of an oldest-first sitemap reaches the current program', () => {
    const urls = Array.from({ length: 237 }, (_, i) => `<url><loc>${page(i + 1)}</loc></url>`).join('')
    const first200 = eventPagesFromSitemap(`<urlset>${urls}</urlset>`, rule).slice(0, 200)
    expect(first200).toContain(page(237))
    expect(first200).not.toContain(page(1))
  })

  it('still keeps only this host and its event paths, each once', () => {
    const xml = `<urlset>
      <url><loc>${page(1)}</loc></url>
      <url><loc>${page(1)}</loc></url>
      <url><loc>${GAC}/about/</loc></url>
      <url><loc>https://elsewhere.example.com/whats-on/all-events/x/</loc></url>
    </urlset>`
    expect(eventPagesFromSitemap(xml, rule)).toEqual([page(1)])
  })
})
