import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

/*
 * EVERY PLAY DECISION IS RECORDED WITH ITS REASON, AND THE EXPIRY SWEEP READS A COLUMN THE TABLE HAS (the PM's 23:56 of
 * 22 November 2026). Monday's law 49 offer play drafted one letter of ten at 23:45, and production kept no record of why
 * the others were not drafted: the planner's reasons lived only in the run's answer, which nothing keeps. The same run's
 * log said "expiry not read: the letters could not be read: column outreach_touches.created_at does not exist". Red on
 * main: playDecisionLines does not exist there, and the sweep ordered by created_at.
 */

vi.mock('server-only', () => ({}))

describe("the run says each play's decisions", () => {
  it('each play with its cap and use, then each contact queued, held, refused or not drafted, with its reason', async () => {
    const { playDecisionLines } = await import('@/lib/outreach/planner')
    const lines = playDecisionLines([
      {
        playId: '7c97ef94-aaaa-bbbb-cccc-000000000000',
        name: 'Law 49: the free promotion offer',
        cap: 10,
        usedToday: 0,
        queued: 1,
        held: [{ contactId: 'c-held', why: ['its words fail the voice gate', 'no unsubscribe link'] }],
        refused: [{ contactId: 'c-refused', why: 'the database refused it: written already' }],
        notDrafted: [{ contactId: 'c-not', why: 'no night of theirs is due its letter today (from T-21, never inside T-7); the nearest is 30 day(s) away' }],
      },
    ])
    expect(lines).toEqual([
      'play Law 49: the free promotion offer (7c97ef94): cap 10, used 0, queued 1, held 1, refused 1, not drafted 1',
      'play 7c97ef94 held c-held: its words fail the voice gate | no unsubscribe link',
      'play 7c97ef94 refused c-refused: the database refused it: written already',
      'play 7c97ef94 not drafted c-not: no night of theirs is due its letter today (from T-21, never inside T-7); the nearest is 30 day(s) away',
    ])
  })

  it('the outreach run logs them after planning, and a play fault is never mistaken for a report', () => {
    const route = readFileSync('src/app/api/cron/outreach-run/route.ts', 'utf8')
    expect(route).toMatch(/if \(!isStepFault\(plays\)\) for \(const line of playDecisionLines\(plays as PlayReport\[\]\)\) console\.log\(`\[cron\/outreach-run\] \$\{line\}`\)/)
  })
})

describe('the expiry sweep reads outreach_touches by a column it has', () => {
  it('orders by drafted_at, which the table has; it has no created_at', () => {
    const sender = readFileSync('src/lib/outreach/sender.ts', 'utf8')
    const sweep = sender.slice(sender.indexOf('export async function expireLapsedLetters'))
    expect(sweep).toMatch(/\.order\('drafted_at'\)/)
    expect(sweep).not.toMatch(/\.order\('created_at'\)/)
    const types = readFileSync('src/types/database.ts', 'utf8')
    const row = types.slice(types.indexOf('      outreach_touches: {'), types.indexOf('        Insert:', types.indexOf('      outreach_touches: {')))
    expect(row).toMatch(/\n {10}drafted_at: string/)
    expect(row).not.toMatch(/\n {10}created_at:/)
  })
})
