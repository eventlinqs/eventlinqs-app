import { describe, expect, it } from 'vitest'
import { contactDecision, type PolicyCandidate, type PolicyHistory } from '@/lib/outreach/contact-policy'

/*
 * ONE OPEN MESSAGE (Lawal, 26 November 2026, 00:01: "You can't be doing too many back-and-forth communications"; the
 * PM's 00:02, item A: "No second message to the same contact while one is unanswered, except the approved follow ups
 * when nothing came back"). A partner's message waits while our newest message that asked something is unanswered, at
 * most the gap in force; its due goals ride in the next message we send anyway (src/lib/outreach/goals.ts). The rest of
 * the contact policy's precedence is held in contact-policy-core.test.ts.
 */

const NOW = new Date('2026-11-25T20:00:00Z') // Thursday 26 November 2026, 07:00 in Melbourne
const DAY = 86_400_000

const history = (over: Partial<PolicyHistory> = {}): PolicyHistory => ({
  organiserId: 'o1',
  contacts: [
    { id: 'c1', address: 'info@studio.example', basis: 'conspicuous_publication' },
    { id: 'c2', address: 'bookings@studio.example', basis: 'conspicuous_publication' },
  ],
  touches: [],
  replies: [],
  suppressed: [],
  bounced: [],
  claimed: false,
  ...over,
})
const partner = (over: Partial<PolicyCandidate> = {}): PolicyCandidate => ({ contactId: 'c1', purpose: 'relationship', step: null, templateKey: 'after_your_night', moment: 'draft', ...over })
const ours = (contactId: string, at: string, purpose = 'cadence', category = 'PERM', state = 'sent') => ({
  id: `t-${purpose}-${at}`, contactId, purpose, step: purpose === 'cadence' ? 1 : null, category, state, sentAt: state === 'sent' ? at : null, scheduledFor: at,
})

describe('a partner message waits while our last message is unanswered', () => {
  it('held, with the reason in words and the gap after it as the latest moment', () => {
    const h = history({ touches: [ours('c2', '2026-11-18T20:00:00Z')] })
    const d = contactDecision(partner(), h, NOW)
    expect(d).toMatchObject({ state: 'held', rule: 'open', nextEligibleAt: new Date(Date.parse('2026-11-18T20:00:00Z') + 30 * DAY).toISOString() })
    expect(d.state === 'held' ? d.reason : '').toBe(
      'our PERM message to bookings@studio.example on 19 Nov 2026 is not answered yet; one message at a time, so this waits for their answer, or 19 Dec 2026 at the latest',
    )
  })

  it('an answer from any of their addresses after it opens the way', () => {
    const h = history({ touches: [ours('c1', '2026-11-18T20:00:00Z')], replies: [{ contactId: 'c2', outcome: 'yes', receivedAt: '2026-11-19T01:00:00Z' }] })
    expect(contactDecision(partner(), h, NOW)).toEqual({ state: 'allowed' })
    // An answer that came before our last message answers nothing of it; a bounce is not an answer.
    const older = history({ touches: [ours('c1', '2026-11-20T20:00:00Z', 'relationship', 'RET')], replies: [{ contactId: 'c1', outcome: 'yes', receivedAt: '2026-11-19T01:00:00Z' }] })
    expect(contactDecision(partner(), older, NOW)).toMatchObject({ rule: 'open' })
    const bounce = history({ touches: [ours('c1', '2026-11-20T20:00:00Z', 'relationship', 'RET')], replies: [{ contactId: 'c1', outcome: 'bounce', receivedAt: '2026-11-21T01:00:00Z' }] })
    expect(contactDecision(partner(), bounce, NOW)).toMatchObject({ rule: 'open' })
  })

  it('never forever: once the gap has passed since it, the message goes', () => {
    const h = history({ touches: [ours('c1', new Date(NOW.getTime() - 30 * DAY - 1).toISOString())] })
    expect(contactDecision(partner(), h, NOW)).toEqual({ state: 'allowed' })
  })

  it('only our newest message counts: an older unanswered letter, answered since by a newer exchange, holds nothing', () => {
    const h = history({
      touches: [ours('c1', '2026-11-10T20:00:00Z'), ours('c1', '2026-11-20T20:00:00Z', 'relationship', 'RET')],
      replies: [{ contactId: 'c1', outcome: 'yes', receivedAt: '2026-11-21T01:00:00Z' }],
    })
    expect(contactDecision(partner(), h, NOW)).toEqual({ state: 'allowed' })
  })
})

describe('what is and is not an open message', () => {
  it('an answer of ours asks nothing, so it never holds a partner message', () => {
    const h = history({ touches: [ours('c1', '2026-11-24T20:00:00Z', 'reply', 'ACQ')] })
    expect(contactDecision(partner(), h, NOW)).toEqual({ state: 'allowed' })
  })

  it('a message on its way counts before drafting; at send only one being sent does; a held draft never does', () => {
    const queued = ours('c2', NOW.toISOString(), 'relationship', 'RET', 'queued')
    expect(contactDecision(partner(), history({ touches: [queued] }), NOW)).toMatchObject({ rule: 'open', nextEligibleAt: new Date(NOW.getTime() + 30 * DAY).toISOString() })
    expect(contactDecision(partner({ moment: 'send' }), history({ touches: [queued] }), NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(partner({ moment: 'send' }), history({ touches: [{ ...queued, state: 'sending' }] }), NOW)).toMatchObject({ rule: 'open' })
    expect(contactDecision(partner(), history({ touches: [{ ...queued, state: 'held' }] }), NOW)).toEqual({ state: 'allowed' })
  })

  it('the gap in force bounds it: 45 days once a reply or opt out names frequency', () => {
    const h = history({ touches: [ours('c1', '2026-10-20T20:00:00Z')], gapDays: 45 })
    expect(contactDecision(partner(), h, NOW)).toMatchObject({ rule: 'open', nextEligibleAt: new Date(Date.parse('2026-10-20T20:00:00Z') + 45 * DAY).toISOString() })
  })
})

describe('what it never holds', () => {
  const unanswered = history({ touches: [ours('c1', '2026-11-24T20:00:00Z')] })

  it('our answer to them, and the one confirmation that their withdrawal was done', () => {
    expect(contactDecision(partner({ purpose: 'reply', templateKey: 'reply_who_are_you' }), unanswered, NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(partner({ templateKey: 'withdrawal_confirmed' }), unanswered, NOW)).toEqual({ state: 'allowed' })
  })

  it("a cold sequence's approved follow up when nothing came back keeps its place", () => {
    expect(contactDecision(partner({ purpose: 'cadence', step: 2, templateKey: 'lifecycle_perm_follow_up' }), unanswered, NOW)).toEqual({ state: 'allowed' })
  })

  it('a stop still comes first', () => {
    const stopped = history({ touches: [ours('c1', '2026-11-24T20:00:00Z')], suppressed: [{ address: 'info@studio.example', at: '2026-11-25T00:00:00Z' }] })
    expect(contactDecision(partner(), stopped, NOW)).toMatchObject({ rule: 'suppressed' })
  })
})
