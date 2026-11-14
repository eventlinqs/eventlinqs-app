/*
 * NOTHING BELOW A LIST CAN BE COVERED (the PM's 04:28 of 15 November 2026: "Fix the layout so the newsletter field can
 * never be covered however long the list is ... One defect is a class: check every guide section that sits below a
 * list of variable length"). #284's Lighthouse mobile gate read accessibility 0.97 on / and /city/melbourne: a month of
 * the guide's list, skipped by content-visibility with a fixed 480 px reservation, spilled its rows over the newsletter
 * field ("partially obscured, smallest space 338px by 4.2px"). A reservation is an estimate, and a list of variable
 * length always outgrows one some day; so no part of the city guide reserves a height for content it does not size
 * itself. Pages whose grids reserve an exact height from their card count (src/lib/ui/event-grid-intrinsic.ts) are not
 * the guide and keep theirs.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const DIR = resolve(process.cwd(), 'src/components/features/city-guide')
const files = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f))
const code = (f: string) =>
  readFileSync(join(DIR, f), 'utf8')
    .replace(/\r\n/g, '\n')
    // comments may name the rule; only code is judged
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the city guide reserves no height for a list of variable length', () => {
  test('the guide folder is read', () => {
    expect(files).toContain('city-guide.tsx')
    expect(files).toContain('city-guide-screen.tsx')
  })
  test.each(files)('%s skips no layout behind a fixed reservation (content-visibility, contain-intrinsic-size)', (f) => {
    expect(code(f)).not.toMatch(/content-visibility|contain-intrinsic-size|cv-section/)
  })
})
