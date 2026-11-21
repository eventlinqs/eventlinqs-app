import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newsletterLinks } from '@/lib/newsletter/edition'
import { buildWhatsOn, type NlPick, type WhatsOnInput } from '@/lib/newsletter/whats-on'

/*
 * EVERY LINK AN EDITION CARRIES OPENS A PAGE OF OURS THAT EXISTS (law 5; law 4, the class with its guard). Read on
 * production at 14:58 on 21 November 2026 (OUR DATA): every edition shipped in #331 linked /newsletter/city (Manage
 * preferences) and /newsletter/refer (Share EventLinqs), and both answered 404, as did /newsletter. This builds an edition
 * from the edition's own link builder, takes every href it carries to our origin, and resolves each path against the
 * routes under src/app the way the app router does (a folder by name, else a [param] folder, route groups transparent,
 * ending in a page or a route handler). A link with no route fails here, before it can ship.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const APP = join(process.cwd(), 'src', 'app')
const TOKEN = '0c3f5b8e-2d41-4a7b-9e10-5f6a7b8c9d0e'

function dirs(dir: string): string[] {
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory())
}

/** True when the app router would answer this path with a page or a route handler under src/app. */
function hasRoute(path: string, dir = APP): boolean {
  const segments = path.split('?')[0].split('#')[0].split('/').filter(Boolean)
  const ends = (d: string) => ['page.tsx', 'page.ts', 'route.ts', 'route.tsx'].some((f) => existsSync(join(d, f)))
  const walk = (d: string, rest: string[]): boolean => {
    for (const group of dirs(d).filter((n) => /^\(.+\)$/.test(n))) if (walk(join(d, group), rest)) return true
    if (rest.length === 0) return ends(d)
    const [head, ...tail] = rest
    if (existsSync(join(d, head)) && statSync(join(d, head)).isDirectory() && walk(join(d, head), tail)) return true
    for (const param of dirs(d).filter((n) => /^\[[^.\]]+\]$/.test(n))) if (walk(join(d, param), tail)) return true
    for (const catchAll of dirs(d).filter((n) => /^\[\[?\.\.\.[^\]]+\]\]?$/.test(n))) if (ends(join(d, catchAll))) return true
    return false
  }
  return walk(dir, segments)
}

const pick = (slug: string, title: string): NlPick => ({
  slug,
  title,
  categoryLabel: 'Festival',
  categorySlug: 'festivals',
  whenLabel: 'Sat 21 Nov, 7:30pm',
  venue: 'Federation Square',
  priceLabel: 'Free entry',
  image: `${ORIGIN}/api/newsletter/image?k=card&src=x`,
  imageAlt: 'A photograph of the night',
})

function edition(token: string | null): WhatsOnInput {
  return {
    edition: 'weekend',
    editionId: 'weekend-melbourne-2026-11-21',
    cityName: 'Melbourne',
    citySlug: 'melbourne',
    datesLabel: 'Sat 21 to Sun 22 Nov 2026',
    subjectDates: 'Sat 21 to Sun 22 Nov',
    areaLabel: 'Melbourne & Surrounds',
    heroImage: { desktop: `${ORIGIN}/api/newsletter/image?k=hero-d&src=x`, mobile: `${ORIGIN}/api/newsletter/image?k=hero-m&src=x` },
    intro: 'Here is the best of this weekend in Melbourne.',
    featured: { ...pick('amcf-2026', 'African Music and Cultural Festival 2026'), blurb: 'Walk in, it is free.', featImage: { desktop: 'https://img.example/d.jpg', mobile: 'https://img.example/m.jpg' } },
    highlights: [pick('colours-of-asia', 'Colours of Asia: Garden of Wonders')],
    free: pick('run-the-tan', 'Run the Tan: Run Club'),
    gem: pick('book-market', 'The Melbourne Book Market'),
    drive: { ...pick('the-church', 'The Church: A Psychedelic Symphony'), cityName: 'Geelong' },
    alerts: [pick('beck', 'Beck')],
    origin: ORIGIN,
    unsubscribeUrl: token ? `${ORIGIN}/unsubscribe/digest/${token}` : `${ORIGIN}/account/notifications`,
    ...newsletterLinks(ORIGIN, { edition: 'weekend', citySlug: 'melbourne', periodStart: '2026-11-21', recipientToken: token }),
  }
}

describe('the route resolver itself', () => {
  it('finds pages, route handlers and [param] folders, and refuses a path with no route', () => {
    expect(hasRoute('/events')).toBe(true)
    expect(hasRoute('/events/any-night-2026-11-21')).toBe(true)
    expect(hasRoute('/unsubscribe/digest/abc')).toBe(true)
    expect(hasRoute('/no-such-page-of-ours')).toBe(false)
    expect(hasRoute('/newsletter/no/such/route/here')).toBe(false)
  })
})

describe("the edition's own links", () => {
  it('the manage link carries the reader’s own token, and none when there is no well formed one', () => {
    expect(newsletterLinks(ORIGIN, { edition: 'weekend', citySlug: 'melbourne', periodStart: '2026-11-21', recipientToken: TOKEN }).manageUrl).toBe(`${ORIGIN}/newsletter/city?t=${TOKEN}`)
    expect(newsletterLinks(ORIGIN, { edition: 'weekend', citySlug: 'melbourne', periodStart: '2026-11-21', recipientToken: null }).manageUrl).toBe(`${ORIGIN}/newsletter/city`)
    expect(newsletterLinks(ORIGIN, { edition: 'week', citySlug: 'geelong', periodStart: '2026-11-25', recipientToken: 'not-a-token' }).manageUrl).toBe(`${ORIGIN}/newsletter/city`)
    expect(newsletterLinks(ORIGIN, { edition: 'week', citySlug: 'geelong', periodStart: '2026-11-25' }).webUrl).toBe(`${ORIGIN}/newsletter/week/geelong/2026-11-25`)
  })

  for (const token of [TOKEN, null]) {
    it(`every link a built edition carries to our origin has a route under src/app (${token ? 'a subscriber' : 'no token'})`, () => {
      const { html, text } = buildWhatsOn(edition(token))
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
      const inText = [...text.matchAll(/https:\/\/www\.eventlinqs\.com\.au[^\s]*/g)].map((m) => m[0])
      const ours = [...new Set([...hrefs, ...inText])].filter((u) => u.startsWith(ORIGIN))
      expect(ours.length).toBeGreaterThan(8)
      expect(ours.some((u) => u.includes('/newsletter/city'))).toBe(true)
      expect(ours.some((u) => u.includes('/newsletter/refer'))).toBe(true)
      expect(ours.some((u) => u.includes('/newsletter/weekend/melbourne/2026-11-21'))).toBe(true)
      const dead = ours.filter((u) => !hasRoute(new URL(u).pathname))
      expect(dead).toEqual([])
    })
  }
})
