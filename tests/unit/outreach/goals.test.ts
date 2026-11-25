import { describe, expect, it } from 'vitest'
import { dueGoals, GOAL_ORDER, goalLinesFor, OWN_GOAL, withGoalLines, type Goal } from '@/lib/outreach/goals'
import { renderTemplate } from '@/lib/outreach/rules'

/*
 * ONE MESSAGE CARRIES EVERY GOAL (Lawal, 26 November 2026, 00:01; the PM's 00:02, item A): before a message to a contact
 * the engine gathers every open goal of its organisation and puts each one that is due into the same message, in the
 * order that matters to them, one short line each with its one link (src/lib/outreach/goals.ts). These hold its pure
 * parts; the drafter carrying them is driven in one-message-drafts.test.ts, and the one open message rule in
 * one-open-message.test.ts.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const PAGE = `${ORIGIN}/photos/c1/0123456789abcdef0123456789abcdef`
const NIGHTS = [
  { slug: 'continuum-dance', title: 'Continuum Dance Performance', startDate: '2026-11-28T02:00:00Z', timezone: 'Australia/Melbourne' },
  { slug: 'continuum-aerial', title: 'Continuum Aerial and Pole', startDate: '2026-11-28T07:00:00Z', timezone: 'Australia/Melbourne' },
  { slug: 'third-night', title: 'A Third Night', startDate: '2026-12-05T09:00:00Z', timezone: 'Australia/Melbourne' },
]
const all = () => dueGoals({ origin: `${ORIGIN}/`, nights: NIGHTS, nightsWithoutTheirPhoto: 2, photoPage: PAGE, claimed: false })

describe('the goals due for an organisation', () => {
  it('every goal that is due, in the order that matters to them, each with its one link', () => {
    const goals = all()
    expect(goals.map((g) => g.key)).toEqual(['listing', 'photo', 'claim', 'future'])
    expect(goals[0]).toEqual({
      key: 'listing',
      line: `Your nights are live on EventLinqs:\nContinuum Dance Performance, Saturday 28 November: ${ORIGIN}/events/continuum-dance\nContinuum Aerial and Pole, Saturday 28 November: ${ORIGIN}/events/continuum-aerial`,
      link: `${ORIGIN}/events/continuum-dance`,
    })
    expect(goals[1]).toEqual({ key: 'photo', line: `If you're happy for us to promote them with your own photos, you can add and approve them here: ${PAGE}`, link: PAGE })
    expect(goals[2].link).toBeNull()
    expect(goals[3].link).toBeNull()
  })

  it('a goal that is not due is not there: no nights, their own photos on every night, an account already held', () => {
    expect(dueGoals({ origin: ORIGIN, nights: [], nightsWithoutTheirPhoto: 0, photoPage: PAGE, claimed: true }).map((g) => g.key)).toEqual(['future'])
    expect(dueGoals({ origin: ORIGIN, nights: NIGHTS.slice(0, 1), nightsWithoutTheirPhoto: 0, photoPage: PAGE, claimed: true }).map((g) => g.key)).toEqual(['listing', 'future'])
    // No photo page of theirs (a contact with no token, a DM contact): the photo goal waits for a message that can carry it.
    expect(dueGoals({ origin: ORIGIN, nights: NIGHTS, nightsWithoutTheirPhoto: 3, photoPage: null, claimed: false }).map((g) => g.key)).toEqual(['listing', 'claim', 'future'])
  })

  it('one night reads as one night', () => {
    const [listing, photo] = dueGoals({ origin: ORIGIN, nights: NIGHTS.slice(2), nightsWithoutTheirPhoto: 1, photoPage: PAGE, claimed: true })
    expect(listing.line).toBe(`Your night is live on EventLinqs:\nA Third Night, Saturday 5 December: ${ORIGIN}/events/third-night`)
    expect(photo.line).toMatch(/^If you're happy for us to promote it with your own photos/)
  })

  it('no line carries a dash, an exclamation mark or a field mark', () => {
    for (const g of all()) {
      expect(g.line).not.toMatch(/[\u2013\u2014!\[\]]/)
      expect(g.line).not.toMatch(/ - /)
    }
  })
})

describe('the lines one message carries', () => {
  it("never the message's own goal", () => {
    expect(OWN_GOAL.lifecycle_perm).toBe('photo')
    const lines = goalLinesFor(all(), { templateKey: 'lifecycle_perm', words: 'Hi Jennifer,' })
    expect(lines).toHaveLength(3)
    expect(lines.some((l) => l.includes(PAGE))).toBe(false)
    expect(goalLinesFor(all(), { templateKey: 'anything_coming_up', words: 'Hi Jennifer,' }).some((l) => l.startsWith('And if you have more nights'))).toBe(false)
  })

  it('never a goal whose link the message already carries, and never the future nights when it already asks', () => {
    const words = `Hi Jennifer,\n\nYour night is on EventLinqs: ${ORIGIN}/events/continuum-dance\n\nAnything coming up next month?`
    const lines = goalLinesFor(all(), { templateKey: 'featured', words })
    expect(lines.map((l) => l.slice(0, 20))).toEqual(["If you're happy for ", 'You can also claim y'])
  })

  it('in the order that matters to them, whatever order they were gathered in', () => {
    const shuffled: Goal[] = [...all()].reverse()
    expect(goalLinesFor(shuffled, { templateKey: null, words: '' })).toEqual(all().map((g) => g.line))
    expect(GOAL_ORDER).toEqual(['listing', 'photo', 'claim', 'future'])
  })
})

describe('the lines go into the letter before its sign off', () => {
  const BODY = 'Hi [first name],\n\nThanks for having us at your night.\n\nKind regards,\n[signature]\n\n[unsubscribe]'

  it('each its own paragraph, before "Kind regards,", the sign off untouched', () => {
    const out = withGoalLines(BODY, ['Line one.', 'Line two.'])
    expect(out).toBe('Hi [first name],\n\nThanks for having us at your night.\n\nLine one.\n\nLine two.\n\nKind regards,\n[signature]\n\n[unsubscribe]')
  })

  it('a template with no sign off takes them at its end; nothing to add leaves it as it was; a field mark is never added', () => {
    expect(withGoalLines('Hi there,\n\nWords.', ['Line one.'])).toBe('Hi there,\n\nWords.\n\nLine one.')
    expect(withGoalLines(BODY, [])).toBe(BODY)
    expect(withGoalLines(BODY, ['Fill [this] in', '  '])).toBe(BODY)
  })

  it('the whole letter renders and passes every rule the render checks, the goals inside its content', () => {
    const template = { channel: 'email' as const, purpose: 'relationship' as const, step: null, subject: 'Re: your nights', body: BODY }
    const lines = goalLinesFor(all(), { templateKey: 'featured', words: BODY })
    const before = renderTemplate(template, { 'first name': 'Jennifer' }, `${ORIGIN}/unsubscribe/outreach?t=x`)
    const after = renderTemplate({ ...template, body: withGoalLines(BODY, lines) }, { 'first name': 'Jennifer' }, `${ORIGIN}/unsubscribe/outreach?t=x`)
    expect(before.heldBecause).toEqual([])
    expect(after.heldBecause).toEqual([])
    for (const l of lines) expect(after.content).toContain(l)
    expect(after.closing).toBe(before.closing)
  })
})
