import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planCheckWords, reasonHead } from '@/lib/ops/plan-check'

/*
 * THE DAILY PLAN CHECK (Lawal's 09:01 of 20 November 2026, item 3). On 20 November the 05:40 and 06:40 social rows read
 * '0 scheduled' and nothing said why; 26 pieces were drafted and none approved, the noon, half past five and seven
 * o'clock slots empty.
 */
describe('the plan check on the social phase row', () => {
  it('counts drafted and eligible pieces and the refusals by their head, most first', () => {
    const plan = [
      { eligible: true, reasons: [] },
      { eligible: false, reasons: ['Outside the standing policy until a person reads it: Slide 1 is the approved file x.jpg.'] },
      { eligible: false, reasons: ['Outside the standing policy until a person reads it: Slide 2 prints the photo credit.', 'The booking link does not answer.'] },
    ]
    expect(planCheckWords(plan, 2)).toEqual({
      words: 'plan: 3 drafted, 1 eligible under the standing policy; refused: Outside the standing policy until a person reads it (2); The booking link does not answer (1); 2 scheduled for the rest of today',
      failed: false,
    })
  })
  it('fails the phase when nothing is scheduled for the rest of the day, and says so', () => {
    const out = planCheckWords([{ eligible: false, reasons: ['The piece has no version to approve.'] }], 0)
    expect(out.failed).toBe(true)
    expect(out.words).toContain('NOTHING scheduled for the rest of today')
  })
  it('says a week with no campaign, and fails it with nothing scheduled', () => {
    expect(planCheckWords(null, 0)).toEqual({ words: 'plan: no campaign this week; NOTHING scheduled for the rest of today', failed: true })
  })
  it('heads a reason at its first colon or full stop, never past 80 characters', () => {
    expect(reasonHead('The code in force would draw it again: the older look')).toBe('The code in force would draw it again')
    expect(reasonHead('x'.repeat(120)).length).toBe(82)
  })
  it('the social run writes it on its schedule and live rows and fails the phase on it', () => {
    const route = readFileSync('src/app/api/cron/social-publish/route.ts', 'utf8')
    expect(route).toContain("if (phase === 'schedule' || phase === 'live') {")
    expect(route).toContain('const dry = await standingPolicyDryRun(db, { now, siteOrigin: getSiteUrl() })')
    expect(route).toContain('plan = planCheckWords(dry, later.count ?? 0)')
    expect(route).toContain('failed: published.held.length > 0 || plan?.failed === true,')
    expect(route).toContain("${plan ? `; ${plan.words}` : ''}`,")
  })
})
