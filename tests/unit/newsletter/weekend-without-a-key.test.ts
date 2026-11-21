import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptyWeekendGuide, weekendDatesLabel } from '@/lib/newsletter/edition'
import { resolveDigestPeriod } from '@/lib/broadcast/digest'

/*
 * /weekend ON A BUILD HOST WITH NO SERVICE-ROLE KEY (#331's CI build, 21 November 2026: 'supabaseKey is required'
 * prerendering /weekend). No key, no admin read: the page renders its thin weekend, with its dates. The rule the other
 * prerendered pages hold (src/lib/events/featured-with-recorded-rights.ts).
 */
describe('the weekend with nothing read', () => {
  it('names the weekend and holds no night', () => {
    const now = new Date('2026-11-21T01:00:00Z')
    const g = emptyWeekendGuide(now)
    expect(g.featured).toBeNull()
    expect(g.picks).toEqual([])
    expect(g.datesLabel).toBe(weekendDatesLabel(resolveDigestPeriod(now, 'weekend')))
  })

  it('the page asks for the key before it makes an admin client', () => {
    const page = readFileSync('src/app/weekend/page.tsx', 'utf8')
    const check = page.indexOf('if (!getSupabaseServiceRoleKey())')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(page.indexOf('readWeekendGuide(createAdminClient()'))
  })
})
