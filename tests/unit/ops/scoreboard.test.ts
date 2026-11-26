import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { POSTS_PER_OPEN_CITY, scoreboardLine, winWords } from '@/lib/ops/scoreboard'
import { ACQ_DAILY_TARGET, ACQ_GUIDE_CITIES } from '@/lib/outreach/acq-target'

/*
 * THE DAY'S WINS, EACH AGAINST ITS APPROVED TARGET (Lawal, 26 November 2026, 00:04: "This engine must be responsible for
 * wins every day ... It must have objectives every day"; the PM's 00:04, item 2): src/lib/ops/scoreboard.ts, every morning.
 */

describe('a win in words', () => {
  it('met, missed with what the engine does today, no target in the plan, or not read', () => {
    expect(winWords({ name: 'First letters sent', target: 10, actual: 12 })).toBe('First letters sent: 12 of 10, MET')
    expect(winWords({ name: 'First letters sent', target: 10, actual: 7, whenMissed: 'the general play drafts up to its cap' })).toBe(
      'First letters sent: 7 of 10, MISSED by 3; today: the general play drafts up to its cap',
    )
    expect(winWords({ name: 'Yeses', target: null, actual: 2, detail: 'listing 1, photo 0, source 1' })).toBe('Yeses: 2 (listing 1, photo 0, source 1), no daily target in the plan')
    expect(winWords({ name: 'Listings added', target: null, actual: null, unread: 'listings added: timeout' })).toBe('Listings added: not read (listings added: timeout)')
  })
})

describe('the line', () => {
  it('counts the misses first, then every win in order', () => {
    const line = scoreboardLine('Wednesday 25 November', [
      { name: 'First letters sent', target: 10, actual: 0, whenMissed: 'x' },
      { name: 'Posts live with their network URL', target: 4, actual: 4 },
      { name: 'Tickets sold on EventLinqs', target: null, actual: 1 },
    ])
    expect(line).toBe(
      'Wednesday 25 November: 1 target missed. First letters sent: 0 of 10, MISSED by 10; today: x. Posts live with their network URL: 4 of 4, MET. Tickets sold on EventLinqs: 1, no daily target in the plan.',
    )
    expect(scoreboardLine('Sunday 22 November', [{ name: 'Yeses', target: null, actual: 0 }])).toBe('Sunday 22 November: every target met. Yeses: 0, no daily target in the plan.')
  })

  it('takes its targets only from the approved ones: law 38 ten, one post per open city', () => {
    expect(ACQ_DAILY_TARGET).toBe(10)
    expect(POSTS_PER_OPEN_CITY * ACQ_GUIDE_CITIES.length).toBe(4)
    // The plan lives on the build machine, outside the repository (law 8 of the build machine's own CLAUDE.md); where it is present it is read.
    const PLAN = 'C:/dev/GROWTH/plan.json'
    if (!existsSync(PLAN)) return
    const raw = readFileSync(PLAN, 'utf8')
    const plan = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as { daily_quotas?: { outreach_messages?: number; social_posts_per_open_city?: number } }
    if (plan.daily_quotas) {
      expect(plan.daily_quotas.outreach_messages).toBe(ACQ_DAILY_TARGET)
      expect(plan.daily_quotas.social_posts_per_open_city).toBe(POSTS_PER_OPEN_CITY)
    }
  })
})

describe('in the 08:00 report, every morning', () => {
  it('the cron reads it and names a failed read in the line', () => {
    const route = readFileSync('src/app/api/cron/health-heartbeat/route.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(route).toMatch(/const scoreboard = await readScoreboard\(db, now\)\.catch\(\(err: unknown\) => `not read: /)
    expect(route).toContain('nextActions, scoreboard })')
  })
})
