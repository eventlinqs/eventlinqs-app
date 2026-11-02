import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * CAR 38, 3 November 2026: production's first build of the edge cached guide was refused by
 * class-lists-are-not-repeated-per-card, quoted: '.next/server/app/city/bendigo.html repeats one 220-character class value
 * 32 times, costing 6820 B beyond the first (budget 6000)'. The guide had never been prerendered before (it was dynamic),
 * and a build with no data renders no rows, so the guard could only see it on production's own data. The class lists a
 * guide renders once per listing or per category now live in globals.css, and this pins it at source, where a build
 * without data can see it: nothing the Row draws carries a class literal long enough to cost the budget at 50 rows.
 */
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n')
const guide = src('src/components/features/city-guide/city-guide.tsx')
const css = src('src/app/globals.css')

describe("the guide's per-listing class lists are utilities", () => {
  it('every utility the row and the tile use is defined in globals.css', () => {
    for (const name of ['guide-row', 'guide-row-when', 'guide-row-title', 'guide-row-line', 'guide-row-book', 'guide-tile']) {
      expect(css, name).toMatch(new RegExp(`@utility ${name} \\{`))
      expect(guide, name).toMatch(new RegExp(`className=[{"\`]+(?:group )?${name}[ "\`]`))
    }
  })

  it('no class literal inside the Row is long enough to cost the 6000 B budget at 50 rows', () => {
    const row = guide.slice(guide.indexOf('function Row('), guide.indexOf('function CitySheet('))
    expect(row.length).toBeGreaterThan(500)
    const literals = [...row.matchAll(/className="([^"]+)"/g)].map((m) => m[1])
    expect(literals.length).toBeGreaterThan(3)
    for (const value of literals) expect(value.length * 49, value).toBeLessThanOrEqual(6000)
  })
})
