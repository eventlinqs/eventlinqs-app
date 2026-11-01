import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE CITY GUIDE SENDS ITS HERO AT ONCE AND STREAMS THE NIGHTS BELOW IT (2 November 2026). Lighthouse on the preview:
 * every request, the preloaded hero image included, began only at about 1.9 s, because the page sent nothing until all
 * of the city's nights were read (TTFB 1.4 to 2.0 s, curl, read 07:30). The hero's photograph is the city's own, known
 * before any query, so it stays in the screen's own body, never behind a boundary (scripts/guards/lcp-preload-in-the-first-
 * flush.mjs, clauses 1 and 2), and everything that needs the nights streams behind a Suspense boundary BELOW it, which that
 * guard names as free to stream. Next's pattern: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md.
 */
const src = readFileSync(join(__dirname, '..', '..', '..', 'src', 'components', 'features', 'city-guide', 'city-guide-screen.tsx'), 'utf8').replace(/\r\n/g, '\n')
const screen = src.slice(src.indexOf('export function CityGuideScreen'), src.indexOf('async function CityGuideBody'))

describe('the city guide streams below its hero', () => {
  it('the screen itself awaits nothing: it is not async and reads no nights', () => {
    expect(src).toMatch(/export function CityGuideScreen\(/)
    expect(screen).not.toMatch(/\bawait\b/)
    expect(screen).not.toContain('loadGuideUpcoming')
  })

  it('the hero comes first and outside the boundary; the nights stream inside it', () => {
    const hero = screen.indexOf('<HeroMedia')
    const open = screen.indexOf('<Suspense')
    const close = screen.indexOf('</Suspense>')
    expect(hero).toBeGreaterThan(-1)
    expect(open).toBeGreaterThan(hero)
    expect(screen.slice(open, close)).toContain('<CityGuideBody')
  })

  it('the body is where the nights are read', () => {
    const body = src.slice(src.indexOf('async function CityGuideBody'))
    expect(body).toContain('loadGuideUpcoming(')
    expect(body).toContain('<CityGuide')
  })
})
