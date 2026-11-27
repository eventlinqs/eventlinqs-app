import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publishedCheck, reminderDue } from '@/lib/social/published-check'

/*
 * M6 (Lawal's directive of 12:35 on 27 November 2026, the PM's 12:55, items 4, 6 and 7). Red on main, where a piece left
 * unapproved was found out at 05:40 and a day with nothing published read as quiet: a piece still unapproved is named to
 * hello@ 24 hours and 3 hours before its slot; at 21:00 every post scheduled to now that did not publish is a FAILURE
 * with its reason, on its own row and emailed; a day with no content planned is not a failure (version 2, 16:00).
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-28T10:00:00Z') // 21:00 in Melbourne

describe('the reminders', () => {
  it('fall due once each, in the hour 24 hours and the hour 3 hours before the slot', () => {
    expect(reminderDue('2026-11-29T09:30:00Z', NOW)).toBe(24)
    expect(reminderDue('2026-11-28T12:30:00Z', NOW)).toBe(3)
    expect(reminderDue('2026-11-29T11:00:00Z', NOW)).toBeNull()
    expect(reminderDue('2026-11-28T11:30:00Z', NOW)).toBeNull()
  })
})

describe('the 21:00 published check', () => {
  const row = (state: string, goAt: string, heldReason: string | null = null) => ({ label: 'week ahead, melbourne', platform: 'instagram', goAt, state, heldReason })
  it('writes every scheduled post that did not publish as a FAILURE with its reason', () => {
    const c = publishedCheck([row('published', '2026-11-27T22:00:00Z'), row('held', '2026-11-28T01:00:00Z', 'the image right lapsed'), row('scheduled', '2026-11-28T11:00:00Z')], NOW)
    expect(c.failed).toBe(true)
    expect(c.line).toBe('published check: 2 scheduled to now, 1 published; FAILURE: week ahead, melbourne on instagram, due 12:00: held, the image right lapsed')
  })
  it('calls a day with nothing planned no failure (the operating model version 2)', () => {
    const none = publishedCheck([], NOW)
    expect(none.failed).toBe(false)
    expect(none.line).toBe('published check: 0 scheduled to now, 0 published; every scheduled post published')
  })
  it('says a whole day plainly', () => {
    expect(publishedCheck([row('published', '2026-11-27T22:00:00Z')], NOW)).toMatchObject({ failed: false, line: 'published check: 1 scheduled to now, 1 published; every scheduled post published' })
  })
  it('the social run reminds each hour, checks at 21:00 on its own row, and emails hello@ with declared types', () => {
    const route = read('src/app/api/cron/social-publish/route.ts')
    expect(route).toContain('const PUBLISHED_CHECK_HOUR = 21')
    expect(route).toContain("const due = await readRemindersDue(db, (week?.pieces ?? []).filter((p) => p.state === 'drafted').map((p) => p.id), now)")
    expect(route).toContain("await recordPhaseRun(db, { phase: 'evening', ride: 'social', startedAt: now, endedAt: new Date(), units: 0, result: `${check.line}; ${count}${mailed}`.slice(0, 2000), failed: check.failed })")
    expect(route).toContain("messageType: 'social_publish_failures'")
    expect(read('src/lib/notifications/recipient-matrix.ts')).toMatch(/type: 'social_publish_failures',\n\s+roles: \['platform_owner'\],/)
  })
})
