import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CONTACT_GAP_DAYS,
  CONTACT_GAP_SOURCE,
  contactDecision,
  contextKeys,
  melbourneDateWords,
  type PolicyCandidate,
  type PolicyHistory,
} from '@/lib/outreach/contact-policy'

/*
 * THE ONE CONTACT POLICY'S PURE CORE (src/lib/outreach/contact-policy.ts; the PM's 01:52 of 23 November 2026, item 2):
 * its precedence, exactly as ruled, and its one gap with its source said. The drafter and the sender reading it are
 * driven in contact-policy.test.ts.
 */

const NOW = new Date('2026-11-22T19:00:00Z') // Monday 23 November 2026, 06:00 in Melbourne
const DAY = 86_400_000

const history = (over: Partial<PolicyHistory> = {}): PolicyHistory => ({
  organiserId: 'o1',
  contacts: [
    { id: 'c1', address: 'info@gallery.example', basis: 'conspicuous_publication' },
    { id: 'c2', address: 'events@gallery.example', basis: 'conspicuous_publication' },
  ],
  touches: [],
  replies: [],
  suppressed: [],
  bounced: [],
  claimed: false,
  ...over,
})
const cold = (over: Partial<PolicyCandidate> = {}): PolicyCandidate => ({ contactId: 'c1', purpose: 'cadence', step: 1, templateKey: 'lifecycle_acq', moment: 'draft', ...over })
const sent = (contactId: string, at: string, category = 'PERM', purpose = 'cadence', step: number | null = 1) => ({ id: `t-${at}`, contactId, purpose, step, category, state: 'sent', sentAt: at, scheduledFor: at })

describe('the gap is one named value, its source said', () => {
  it('30 days, marked UNSOURCED with the precedent it follows, and typed nowhere else in a workflow', () => {
    expect(CONTACT_GAP_DAYS).toBe(30)
    expect(CONTACT_GAP_SOURCE).toMatch(/^UNSOURCED: /)
    const src = readFileSync('src/lib/outreach/contact-policy.ts', 'utf8')
    expect(src).toMatch(/UNSOURCED: neither the communication standard/)
    for (const f of ['drafts.ts', 'sender.ts', 'planner.ts', 'lifecycle-play.ts', 'segment-a-play.ts', 'follow-ups.ts', 'twenty-drafts.ts', 'replies.ts']) {
      expect(readFileSync(`src/lib/outreach/${f}`, 'utf8')).not.toMatch(/CONTACT_GAP_DAYS|30 \* (86_400_000|DAY)/)
    }
  })
})

describe('the precedence, exactly as ruled', () => {
  it('suppression comes first: it holds even a reply, and beats a reply, a claim and the gap', () => {
    const h = history({ suppressed: [{ address: 'events@gallery.example', at: '2026-11-20T00:00:00Z' }], replies: [{ contactId: 'c1', outcome: 'question', receivedAt: '2026-11-19T00:00:00Z' }], claimed: true })
    expect(contactDecision(cold(), h, NOW)).toMatchObject({ state: 'held', rule: 'suppressed', nextEligibleAt: null })
    expect(contactDecision(cold({ purpose: 'reply', step: null, templateKey: 'reply_cost' }), h, NOW)).toMatchObject({ rule: 'suppressed' })
    expect(contactDecision(cold({ purpose: 'relationship', step: null, templateKey: 'featured' }), h, NOW)).toMatchObject({ rule: 'suppressed' })
  })

  it('the one stop confirmation goes to the contact who asked, and to nobody else', () => {
    const h = history({ suppressed: [{ address: 'events@gallery.example', at: '2026-11-20T00:00:00Z' }] })
    expect(contactDecision(cold({ contactId: 'c2', purpose: 'reply', step: null, templateKey: 'reply_stop' }), h, NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(cold({ contactId: 'c1', purpose: 'reply', step: null, templateKey: 'reply_stop' }), h, NOW)).toMatchObject({ rule: 'suppressed' })
    const byReply = history({ replies: [{ contactId: 'c1', outcome: 'take_down', receivedAt: '2026-11-20T00:00:00Z' }] })
    expect(contactDecision(cold({ purpose: 'reply', step: null, templateKey: 'reply_take_down' }), byReply, NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(cold({ contactId: 'c2', purpose: 'reply', step: null, templateKey: 'reply_take_down' }), byReply, NOW)).toMatchObject({ rule: 'opted out' })
  })

  it('a hard bounce holds every category to that address, and not the organiser\'s other address', () => {
    const h = history({ bounced: [{ contactId: 'c1', at: '2026-11-02T00:00:00Z' }] })
    expect(contactDecision(cold({ purpose: 'relationship', step: null, templateKey: 'featured' }), h, NOW)).toMatchObject({ rule: 'bounced' })
    expect(contactDecision(cold({ contactId: 'c2' }), h, NOW)).toEqual({ state: 'allowed' })
  })

  it('a reply from any of their addresses ends cold letters and cold follow ups, never the answer or the partner flow', () => {
    const h = history({ replies: [{ contactId: 'c2', outcome: 'later', receivedAt: '2026-11-19T00:00:00Z' }] })
    expect(contactDecision(cold(), h, NOW)).toMatchObject({ rule: 'replied', nextEligibleAt: null })
    expect(contactDecision(cold({ step: 2, templateKey: 'segment_a_day4' }), h, NOW)).toMatchObject({ rule: 'replied' })
    expect(contactDecision(cold({ purpose: 'reply', step: null, templateKey: 'reply_not_now' }), h, NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(cold({ purpose: 'relationship', step: null, templateKey: 'anything_coming_up' }), h, NOW)).toEqual({ state: 'allowed' })
    // A bounce logged as an outcome is not a person writing back.
    expect(contactDecision(cold(), history({ replies: [{ contactId: 'c2', outcome: 'bounce', receivedAt: '2026-11-19T00:00:00Z' }] }), NOW)).toEqual({ state: 'allowed' })
  })

  it('a claimed organiser and a partner by consent follow their own flow: no cold letter, the partner message goes', () => {
    expect(contactDecision(cold(), history({ claimed: true }), NOW)).toMatchObject({ rule: 'own flow' })
    const partner = history({ contacts: [{ id: 'c1', address: 'info@gallery.example', basis: 'express_consent' }] })
    expect(contactDecision(cold(), partner, NOW)).toMatchObject({ rule: 'own flow' })
    expect(contactDecision(cold({ purpose: 'relationship', step: null, templateKey: 'anything_coming_up' }), partner, NOW)).toEqual({ state: 'allowed' })
  })
})

describe('frequency: one unsolicited first touch inside the gap', () => {
  it('any category, any of their addresses, counts; the next eligible moment is the gap after the last unanswered one', () => {
    const h = history({ touches: [sent('c2', '2026-11-01T00:00:00Z', 'ACQ'), sent('c2', '2026-11-17T20:00:00Z', 'PERM')] })
    const d = contactDecision(cold(), h, NOW)
    expect(d).toMatchObject({ state: 'held', rule: 'gap', nextEligibleAt: new Date(Date.parse('2026-11-17T20:00:00Z') + 30 * DAY).toISOString() })
    expect(d.state === 'held' ? d.reason : '').toBe(
      'last written unsolicited on 18 Nov 2026 (a PERM letter to events@gallery.example) and not answered; one unsolicited first letter per 30 days, so the next may go from 18 Dec 2026',
    )
  })

  it("a sequence's own follow up is excepted; a partner message and a reply are not unsolicited and never start the gap", () => {
    const h = history({ touches: [sent('c1', '2026-11-17T20:00:00Z')] })
    expect(contactDecision(cold({ step: 2, templateKey: 'segment_a_day4' }), h, NOW)).toEqual({ state: 'allowed' })
    const warm = history({ touches: [sent('c1', '2026-11-20T00:00:00Z', 'RET', 'relationship', null), sent('c1', '2026-11-21T00:00:00Z', 'ACQ', 'reply', null)] })
    expect(contactDecision(cold(), warm, NOW)).toEqual({ state: 'allowed' })
  })

  it('before drafting a letter already queued counts as written; at send only one being sent does, so two queued letters never hold each other', () => {
    const queued = { id: 'q', contactId: 'c2', purpose: 'cadence', step: 1, category: 'PERM', state: 'queued', sentAt: null, scheduledFor: NOW.toISOString() }
    expect(contactDecision(cold(), history({ touches: [queued] }), NOW)).toMatchObject({ rule: 'gap', nextEligibleAt: new Date(NOW.getTime() + 30 * DAY).toISOString() })
    expect(contactDecision(cold({ moment: 'send' }), history({ touches: [queued] }), NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(cold({ moment: 'send' }), history({ touches: [{ ...queued, state: 'sending' }] }), NOW)).toMatchObject({ rule: 'gap' })
  })

  it('a held draft, never sent, does not count', () => {
    const draft = { id: 'h', contactId: 'c2', purpose: 'cadence', step: 1, category: 'PERM', state: 'held', sentAt: null, scheduledFor: null }
    expect(contactDecision(cold(), history({ touches: [draft] }), NOW)).toEqual({ state: 'allowed' })
  })
})

describe('the words and the contexts', () => {
  it('dates are Melbourne dates in one spelling', () => {
    expect(melbourneDateWords('2026-11-17T20:00:00Z')).toBe('18 Nov 2026')
    expect(melbourneDateWords('2026-12-17T12:59:00Z')).toBe('17 Dec 2026')
    expect(melbourneDateWords('2026-12-17T13:00:00Z')).toBe('18 Dec 2026')
  })
  it('each context has one spelling the database check accepts', () => {
    const shape = /^[a-z_]+:.+$/
    for (const k of [contextKeys.event('e1'), contextKeys.play('p1'), contextKeys.page('https://x.example/whats-on', '2026-12-05'), contextKeys.report('r1'), contextKeys.kit('k1'), contextKeys.withdrawal('w1'), contextKeys.reply('<a@b>')]) {
      expect(k).toMatch(shape)
    }
    expect(contextKeys.event('e1')).toBe('event:e1')
  })
})
