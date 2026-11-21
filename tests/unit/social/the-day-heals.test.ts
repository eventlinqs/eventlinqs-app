import { describe, expect, it } from 'vitest'
import { chooseToday, STORIES_PER_DAY, type Candidate, type Run } from '@/lib/social/lifecycle'

/*
 * THE DAY'S CHOICE HEALS (the PM's 16:30 of 21 November 2026, item 1; Lawal, 16:26: "Why is there no intelligence on the
 * system?"). On 21 November the only eligible night offered a tomorrow story with no window, and nothing posted. Now a
 * moment that cannot be drawn is passed over without spending its cap; the same moment in the other format is tried for
 * that night; and only then the next night.
 */
const run = (key: string, over: Partial<Run> = {}): Run =>
  ({ key, nights: [], days: ['2026-11-22'], zone: 'Australia/Melbourne', tier: 1, ticketedHere: false, salesOpen: true, ...over }) as unknown as Run
const cand = (r: Run, kind: Candidate['moment']['kind'], format: 'feed' | 'story'): Candidate => ({ run: r, moment: { kind, format }, hasPhoto: true })
const account = { feedToday: 0, feedLastSeven: 0, storiesToday: 0 }

describe('chooseToday', () => {
  it('passes over a moment that cannot post and draws the same moment in the other format for that night', () => {
    const colours = run('colours-of-asia')
    const { chosen, passedOver } = chooseToday([cand(colours, 'tomorrow', 'story')], account, (c) => (c.moment.format === 'story' ? 'no story band on its day' : null))
    expect(chosen.map((c) => `${c.run.key} ${c.moment.kind} ${c.moment.format}`)).toEqual(['colours-of-asia tomorrow feed'])
    expect(passedOver.map((p) => p.why)).toEqual(['no story band on its day'])
  })

  it('then the next night, and a passed over moment never spends its cap', () => {
    const a = run('a')
    const b = run('b')
    const stories = Array.from({ length: STORIES_PER_DAY }, (_, i) => cand(run(`s${i}`), 'first_day', 'story'))
    const { chosen } = chooseToday([cand(a, 'tomorrow', 'story'), ...stories, cand(b, 'tomorrow', 'story')], { ...account, feedToday: 1 }, (c) =>
      c.run.key === 'a' ? 'its night would have started by its band' : null,
    )
    // a's story and its feed fallback are passed over (the feed cap is spent today), so all four stories go to others.
    expect(chosen.filter((c) => c.moment.format === 'story')).toHaveLength(STORIES_PER_DAY)
    expect(chosen.some((c) => c.run.key === 'a')).toBe(false)
  })

  it('a day with any drawable moment never ends with nothing', () => {
    const nights = ['x', 'y', 'z'].map((k) => cand(run(k), 'announce', 'feed'))
    const { chosen } = chooseToday(nights, account, (c) => (c.run.key === 'z' ? null : 'no permitted photograph for a feed'))
    expect(chosen.map((c) => c.run.key)).toEqual(['z'])
  })

  it('a tier 4 night is never given a feed post as its fallback', () => {
    const quiet = run('quiet', { tier: 4 } as Partial<Run>)
    const { chosen } = chooseToday([cand(quiet, 'tomorrow', 'story')], account, (c) => (c.moment.format === 'story' ? 'no story band' : null))
    expect(chosen).toEqual([])
  })
})
