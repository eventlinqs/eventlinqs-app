import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
    // The Command Centre's own task count is named as tasks, so the two never read as one figure disagreeing.
    expect(today).toContain('Tasks waiting for approval')
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
