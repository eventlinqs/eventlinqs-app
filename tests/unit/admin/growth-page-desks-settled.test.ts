import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONE SLOW OR FAILED DESK NEVER ENDS /admin/growth (the PM's 15:41 of 20 November 2026: a Server Components error there at
// 15:36; readAcquisitionDesk throws on any error of growth_acquisition_facts, and the page awaited its seven desks in one
// Promise.all). Drilled red on the page as it stood: it awaited readGrowthDesk(), readAcquisitionDesk() and
// readCoverageDesk() bare, and rendered their sections with no failure state.
const page = readFileSync(join(process.cwd(), 'src', 'app', 'admin', '(authed)', 'growth', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('the growth page stands when a desk cannot be read', () => {
  it('settles the three desk reads inside the one batch', () => {
    expect(page).toMatch(/settle\(readGrowthDesk\(\)\), settle\(readAcquisitionDesk\(\)\), settle\(readCoverageDesk\(\)\)/)
    expect(page).not.toMatch(/readGrowthDesk\(\), readAcquisitionDesk\(\), readCoverageDesk\(\)/)
  })
  it('says each desk that could not be read in its own section, and draws the rest', () => {
    for (const [ok, section] of [['desk', 'growth-desk'], ['acq', 'acquisition-desk'], ['coverage', 'coverage-desk']]) {
      expect(page).toContain(`{${ok}.ok ? `)
      expect(page).toContain(`<DeskNotRead section="${section}"`)
    }
    expect(page).toMatch(/function DeskNotRead\([\s\S]*Not read just now: \{why\}/)
  })
  it('starts the marketing and learning reads beside the desks, never after them', () => {
    expect(page.indexOf('const marketingRead = settle(')).toBeLessThan(page.indexOf('await Promise.all([readGrowthWeek()'))
    expect(page.indexOf('const learningRead = settle(')).toBeLessThan(page.indexOf('await Promise.all([readGrowthWeek()'))
  })
})
