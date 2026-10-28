import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORMAT_NAME, cadenceLine, type CadenceRule } from '@/lib/social/cadence'

/*
 * /admin/social said "Storys go at least 2 hours apart" (window 3's drive at 390, 28 October 2026): its plural was the
 * name with an s added. Each format's plural is written out, and the page says it through the one function.
 */

const starting = { basis: 'starting', gapHours: 2, floorPosts: 12, settleHours: 48 } as unknown as CadenceRule

describe("the cadence line's words", () => {
  it('says Stories and Feed cards, never Storys', () => {
    expect(cadenceLine('story', starting, 'one may go now')).toMatch(/^Stories go at least 2 hours apart, one may go now\./)
    expect(cadenceLine('feed', { ...starting, gapHours: 12 } as CadenceRule, 'one may go now')).toMatch(/^Feed cards go at least 12 hours apart/)
    for (const f of Object.values(FORMAT_NAME)) expect(f.many).not.toMatch(/ys$/)
  })

  it('the page builds no plural of its own', () => {
    const page = readFileSync(join(__dirname, '..', '..', '..', 'src', 'app', 'admin', '(authed)', 'social', 'page.tsx'), 'utf8')
    expect(page).not.toMatch(/FORMAT_NAME\[[^\]]+\]\}s /)
    expect(page).toContain('cadenceLine(format, rule, when)')
  })
})
