import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllCities } from '@/lib/cities/data'
import { CITY_NAMES } from '@/lib/cities/city-names'

/*
 * THE GATE OF 5 NOVEMBER 2026, 23:45, BLOCKED AT THE BUILD: '[initial-bundle-budget] FAIL: /events/[slug] is a PUBLIC
 * route at 205.9 KB gzip of first-load JavaScript, over the Scope v5 10.3 budget of 200.0 KB by 5.9 KB'. The cause: the
 * shared header's Browse link read the chosen city through src/lib/events/chosen-city.ts, which imported getAllCities()
 * from src/lib/cities/data.ts (48 KB of every city's words) into every page's client bundle. The browser gets the names
 * and slugs only (src/lib/cities/city-names.ts), held equal to the full list here.
 */
describe('the light city list the browser reads (CITY_NAMES)', () => {
  it('names exactly the cities the platform lists, slug and name', () => {
    expect([...CITY_NAMES].map(([slug, name]) => `${slug}|${name}`).sort()).toEqual(getAllCities().map((c) => `${c.slug}|${c.name}`).sort())
  })
  it('never pulls the full city data into code the browser loads', () => {
    for (const f of ['src/lib/events/chosen-city.ts', 'src/lib/cities/city-names.ts', 'src/lib/hooks/use-chosen-events-href.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toMatch(/@\/lib\/cities\/data|from '\.\/data'/)
    }
  })
})
