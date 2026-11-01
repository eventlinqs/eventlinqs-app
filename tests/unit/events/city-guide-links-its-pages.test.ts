import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE CITY GUIDE LINKS THE CITY'S OWN RANKED PAGES (the gate's internal-reachability step stopped the city guide at
 * 21:30 on 1 November 2026: '/city/[slug]/[suburb] ... /events/browse/[city] ... /free/[city]/this-week ... NOTHING on
 * the crawled site links to it'). The old city page linked all three; the guide that replaced it must too.
 */
describe('the city guide links the city’s own pages', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide-screen.tsx'), 'utf8')
  it('browse every event, the free week where it exists, and every suburb of a tier 1 city', () => {
    expect(src).toContain('href={`/events/browse/${city.slug}`}')
    expect(src).toMatch(/freeWeek \? \([\s\S]*href=\{`\/free\/\$\{city\.slug\}\/this-week`\}/)
    expect(src).toMatch(/href=\{`\/city\/\$\{city\.slug\}\/\$\{/)
    expect(src).toContain('getSuburbsForCity(')
  })
})
