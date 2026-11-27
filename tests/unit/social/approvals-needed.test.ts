import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { approvalsNeeded, approvalsNeededWords } from '@/lib/ops/plan-check'

/*
 * M4 (the PM's 12:18 of 27 November 2026: "4 of this week's 7 pieces have no approval", and the 05:40 and 06:40 runs said
 * only "0 eligible under the standing policy"). Red on main, where no one was told which pieces waited for a person: the
 * schedule run names each piece the standing policy cannot approve, with its first reason, on its own row, and at 05:40
 * emails hello@ the one line so Lawal approves them at /admin/social before 09:00.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

describe('the pieces a person must approve', () => {
  const plan = [
    { label: 'creative, melbourne', eligible: false, reasons: ['The piece has no version to approve.'] },
    { label: 'week ahead, melbourne', eligible: true, reasons: [] },
    { label: 'organiser campaign, Kyivska, melbourne', eligible: false, reasons: ['A night in it has ended: Kyivska Sunday.'] },
  ]
  it('are the ones the policy cannot approve, each named with its first reason', () => {
    expect(approvalsNeeded(plan)).toEqual(['creative, melbourne (The piece has no version to approve)', 'organiser campaign, Kyivska, melbourne (A night in it has ended)'])
    expect(approvalsNeeded(null)).toEqual([])
  })
  it('are said in one line, or plainly none', () => {
    expect(approvalsNeededWords(approvalsNeeded(plan))).toBe(
      "2 need a person's approval at /admin/social: creative, melbourne (The piece has no version to approve); organiser campaign, Kyivska, melbourne (A night in it has ended)",
    )
    expect(approvalsNeededWords([])).toBe("no piece needs a person's approval")
  })
})

describe('the schedule run and its email', () => {
  it('writes the list on the run row and, at the schedule phase, emails hello@ once with a declared type', () => {
    const route = read('src/app/api/cron/social-publish/route.ts')
    expect(route).toContain('const needs = approvalsNeeded(dry)')
    expect(route).toContain("if (phase === 'schedule' && needs.length > 0) {")
    expect(route).toMatch(/sendEmail\(\{ to: PLATFORM_INBOX, subject: .*messageType: 'social_approvals_needed', recipientRole: 'platform_owner' \}\)/)
    expect(route).toContain('plan = { words: `${plan.words}; ${approvalsNeededWords(needs)}${mailed}`, failed: plan.failed }')
    expect(read('src/lib/notifications/recipient-matrix.ts')).toMatch(/type: 'social_approvals_needed',\n\s+roles: \['platform_owner'\],/)
  })
})
