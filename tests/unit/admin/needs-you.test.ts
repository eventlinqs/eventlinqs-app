import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { needsYou, type WaitingCard } from '@/lib/admin/automation-math'
import { agrees, countOf } from '@/lib/text/plural'

/**
 * ONE COUNT OF WHAT WAITS, BOTH PAGES READING IT (the PM's 02:45 of 16 November 2026, fix 1): Today said 'Waiting for
 * approval 0' beside Automation's 5 posts and 3 letters on the same database. needsYou sums the cards' own counts; this
 * holds the two pages to one fixture and to reading it.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const FIXTURE: WaitingCard[] = [
  { waitsFor: '5 pieces wait for approval', readFailed: null, waiting: 5, approvalNoun: 'post' },
  { waitsFor: 'The sender is on hold; 3 letters wait for your approval before they can queue', readFailed: null, waiting: 3, approvalNoun: 'letter' },
  { waitsFor: null, readFailed: null, waiting: 0, approvalNoun: 'follow up' },
  { waitsFor: '19 organiser photos to look at', readFailed: null, waiting: 19 },
  { waitsFor: null, readFailed: 'outreach_replies: timeout', waiting: 0 },
]

describe('what waits for a person, one source for Today and Automation', () => {
  it('counts the tasks Automation lists and the approvals inside them, from the cards alone', () => {
    const n = needsYou(FIXTURE)
    expect(n.tasks).toBe(4) // three cards wait, one could not be read: 'Needs you today (4)'
    expect(n.approvals).toBe(8) // 5 posts and 3 letters: Today's 'Waiting for approval 8'
    expect(n.parts.map((p) => countOf(p.n, p.noun))).toEqual(['5 posts', '3 letters'])
    expect(n.unread).toBe(1)
  })

  it('both pages read it: Automation counts its tasks by it, Today its approvals', () => {
    const automation = read('src/app/admin/(authed)/automation/page.tsx')
    // Since the PM's 05:37 fix 2 Automation's heading and button read Today's queue, the same total Today shows.
    expect(automation).toContain('readTodayQueue(now)')
    expect(automation).toContain('<Panel title={line.heading}>')
    expect(automation).toContain('Review what needs you ({line.total})')
    const today = read('src/app/admin/(authed)/today/page.tsx')
    expect(today).toContain('needs: needsYou(a.cards)')
    expect(today).toContain('value={automation.ok ? count.format(automation.needs.approvals)')
    // ADMIN 2 (05:2x): the Command Centre strip's 'Tasks waiting for approval 0' stood beside 'Waiting for approval 8'.
    // The task list copies the posts and plays waiting and lags them, so the strip never repeats the count.
    expect(today).not.toContain('Tasks waiting for approval')
    expect(today).not.toContain('centre.waitingApproval')
  })
})

describe('a count said as a person says it (fix 3)', () => {
  it('one for one, the plural for more, and the verb agrees', () => {
    expect(countOf(1, 'piece')).toBe('1 piece')
    expect(countOf(5, 'piece')).toBe('5 pieces')
    expect(countOf(2, 'reply', 'replies')).toBe('2 replies')
    expect(countOf(1200, 'letter')).toBe('1,200 letters')
    expect(`${countOf(1, 'letter')} ${agrees(1, 'waits', 'wait')}`).toBe('1 letter waits')
  })
})

describe("a first letter waiting for approval, one definition (ADMIN 2: 'Waiting for you' left the 3 letters out)", () => {
  it('Automation counts and Today lists by the same four filters, from letters-waiting.ts', () => {
    const automation = read('src/lib/admin/automation.ts')
    const today = read('src/lib/admin/today.ts')
    for (const src of [automation, today]) {
      expect(src).toContain("import { LETTER_WAITS, PHOTO_WAITS } from './what-waits'")
      expect(src).toContain("PHOTO_WAITS.assetState")
      // 16 November 2026: production counted 21 organiser photos to look at while 14 of them were approved already; only
      // a photo still pending its look, and not withdrawn, waits.
      expect(src).toContain(".eq('approval_status', PHOTO_WAITS.approvalStatus)")
      expect(src).toContain(".eq('withdrawal_status', PHOTO_WAITS.withdrawalStatus)")
      expect(src).toContain(".eq('step', LETTER_WAITS.step)")
      expect(src).toContain(".eq('state', LETTER_WAITS.state)")
      expect(src).toContain(".eq('held_because', LETTER_WAITS.heldBecause)")
    }
    expect(automation).toContain('waiting,')
    expect(today).toContain("{ key: 'letters', section: 'letters'")
  })
})

describe("every admin date through admin-dates.ts (ADMIN 2: 'Sat, 28 Nov, 2:48 am' on Submitted events)", () => {
  it('no admin page builds its own weekday formatter', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [] })
    const own = walk(join(process.cwd(), 'src/app/admin')).filter((f) => /new Intl\.DateTimeFormat\([^)]*weekday/s.test(readFileSync(f, 'utf8')))
    expect(own.map((f) => f.slice(process.cwd().length + 1))).toEqual([])
  })
})

describe("one unit on Today and Automation (the PM's 05:37 fix 2: 69 things beside 'Needs you today (5)')", () => {
  it('the heading says the total of things and the groups that hold them, from the queue alone', async () => {
    const { needsLine } = await import('@/lib/admin/today-math')
    const item = (id: string) => ({ id, what: 'x', why: 'y', since: '2026-11-16T00:00:00Z', href: null })
    const section = (key: string, n: number) => ({ key: key as never, title: key, items: Array.from({ length: n }, (_, i) => item(`${key}${i}`)), unread: [], failed: [] })
    const q = { sections: [section('submissions', 2), section('pieces', 5), section('letters', 3), section('photos', 0), section('exceptions', 59)], waiting: 69 }
    const line = needsLine(q)
    expect(line.heading).toBe('Needs you today, 69 things in 4 groups')
    expect(line.total).toBe(69)
    expect(line.groups.map((g) => g.key)).toEqual(['submissions', 'pieces', 'letters', 'exceptions'])
    expect(needsLine({ sections: [section('pieces', 1)], waiting: 1 }).heading).toBe('Needs you today, 1 thing in 1 group')
    expect(needsLine({ sections: [], waiting: 0 }).heading).toBe('Needs you today')
  })
})
