import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEASURES, reliabilityLine, reliabilityOf, scoreRows, SCORE_FLOOR } from '@/lib/social/scorecard'

/*
 * CAR U, U3 AND U4 (the PM's 02:12 of 28 November 2026; the scorecard standard, sections 1 and 5). Red on main, where a
 * piece carried no scorecard and nothing counted publishing reliability: now the eight measures are read with each studio
 * piece and shown in /admin/social, the engine's and the PM's, a score under the floor of 9 said; and the running count of
 * approved posts published on time and verified within ten minutes rides /admin/social and the evening check, a miss
 * resetting it, five in a row "demonstrated".
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-28T12:00:00Z')

describe('the scorecard', () => {
  it("reads the eight measures, the engine's and the PM's, and says a score under the floor", () => {
    expect(MEASURES).toHaveLength(8)
    expect(SCORE_FLOOR).toBe(9)
    const rows = scoreRows({ engine: { brand_identity: 9.2, conversion_readiness: 8.5, looked_at: 'the phone views' }, pm: { brand_identity: 9 } })
    expect(rows[0]).toEqual({ key: 'brand_identity', name: 'Brand identity', engine: 9.2, pm: 9, below: false })
    expect(rows.find((r) => r.key === 'conversion_readiness')).toMatchObject({ engine: 8.5, pm: null, below: true })
    expect(scoreRows(null).every((r) => r.engine === null && r.pm === null && !r.below)).toBe(true)
  })
})

describe('the publishing reliability count', () => {
  const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000).toISOString()
  const onTime = (minAgo: number) => ({ go_at: at(minAgo), state: 'published', published_at: at(minAgo - 3) })
  it('counts posts published and verified within ten minutes, and a miss resets it', () => {
    expect(reliabilityOf([onTime(300), onTime(200), onTime(100)], NOW)).toEqual({ count: 3, demonstrated: false, lastMiss: null })
    const late = { go_at: at(150), state: 'published', published_at: at(130) }
    expect(reliabilityOf([onTime(300), late, onTime(100)], NOW)).toEqual({ count: 1, demonstrated: false, lastMiss: at(150) })
    const held = { go_at: at(150), state: 'held', published_at: null }
    expect(reliabilityOf([onTime(300), held], NOW).count).toBe(0)
  })
  it('is demonstrated at five in a row, and a slot inside its ten minutes is not judged yet', () => {
    expect(reliabilityOf([500, 400, 300, 200, 100].map(onTime), NOW).demonstrated).toBe(true)
    expect(reliabilityOf([onTime(100), { go_at: at(5), state: 'scheduled', published_at: null }], NOW).count).toBe(1)
    expect(reliabilityLine({ count: 1, demonstrated: false, lastMiss: null })).toBe('publishing reliability: 1 approved post in a row published on time and verified within ten minutes (demonstrated at 5)')
  })
})

describe('the wiring', () => {
  it("shows both on /admin/social, the scorecard beside the phone views, and the count in the evening check's row", () => {
    const page = read('src/app/admin/(authed)/social/page.tsx')
    expect(page).toContain('<table data-scorecard')
    expect(page).toContain('reliabilityLine(reliability)')
    expect(read('src/app/api/cron/social-publish/route.ts')).toContain('result: `${check.line}; ${count}${mailed}`.slice(0, 2000)')
    expect(read('src/lib/social/studio-proof.ts')).toContain("scores: scoreRows(row.scorecard ?? null),")
    expect(read('supabase/migrations/20261128040001_the_scorecard_travels_with_the_piece.sql')).toContain("add column if not exists scorecard jsonb check (scorecard is null or jsonb_typeof(scorecard) = 'object');")
  })
})
