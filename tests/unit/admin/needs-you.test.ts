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
    expect(automation).toContain('<Panel title="Needs you today" count={needsYou(cards).tasks}>')
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
      expect(src).toContain("import { LETTER_WAITS } from './letters-waiting'")
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
