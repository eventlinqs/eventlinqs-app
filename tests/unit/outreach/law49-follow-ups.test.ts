import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'
import { ACQ_FOLLOW_UP_KEY, LIFECYCLE_ACQ_FOLLOW_UP, draftAcqFollowUp } from '@/lib/outreach/acq-follow-up'
import { LAWAL_MAILBOX } from '@/lib/outreach/addresses'
import type { LifecycleFacts } from '@/lib/outreach/lifecycle-letters'
import { PERM_FOLLOW_UP_KEY } from '@/lib/outreach/perm-follow-up'
import { touchVoiceMessage } from '@/lib/outreach/touch-voice'
import { readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'

vi.mock('server-only', () => ({}))

/*
 * LAW 49'S FOLLOW UPS, ONE EACH (the PM's 12:11 of 25 November 2026, item 1, under Lawal's standing rule of 12:10; law
 * 49's 'follow ups once'; the communication standard Lawal adopted on 22 November: 'one appropriate follow-up'). Red on
 * main, where a law 49 play has no follow up at all ("their words wait on Lawal's one template approval"):
 *   1. the offer's one follow up: its template, in the offer's thread, from lawal@, passing every rule and the gateway;
 *   2. it goes only on its night's clock (once, from T-14, four days after the offer, never inside T-7), never after a
 *      reply, never twice, never for an event on or after its day;
 *   3. both follow ups are in their first letter's class (law 24), and the planner drafts them for a law 49 play.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000`
const CAROLS: LifecycleFacts = {
  organiserName: 'Melbourne Recital Centre',
  personName: null,
  websiteUrl: 'https://www.melbournerecital.com.au',
  night: {
    title: 'A Ceremony of Carols',
    slug: 'a-ceremony-of-carols-melbourne-recital-centre-2026-12-12',
    startDate: '2026-12-12T08:00:00Z', // Saturday 12 December 2026, 7pm in Melbourne
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    bookingUrl: 'https://www.melbournerecital.com.au/events/2026/a-ceremony-of-carols',
  },
  photoLink: null,
  approvalLink: null,
  origin: ORIGIN,
}
const EVENT = { startDate: CAROLS.night.startDate, endDate: null, status: 'published', timezone: 'Australia/Melbourne' }
// The offer went on Monday 23 November 2026, 07:05 in Melbourne (T-19), in its thread.
const QUIET = { eligible: true, replied: false, offerSentAt: '2026-11-22T20:05:00Z', followUpSentAt: null }
const THREAD = "A Ceremony of Carols on Saturday 12 December: let's fill it"
const SAT_28_7AM = new Date('2026-11-27T20:00:00Z') // Saturday 28 November, 07:00: T-14, five days after the offer
const draft = (over: Partial<Parameters<typeof draftAcqFollowUp>[0]> = {}) =>
  draftAcqFollowUp({ facts: CAROLS, record: QUIET, event: EVENT, unsubscribeUrl: UNSUB, threadSubject: THREAD, now: SAT_28_7AM, ...over })

describe("1. the offer's one follow up", () => {
  it('is drafted in the offer\'s thread, signs as Lawal replies, carries its one link and the opt out, and passes the gateway', () => {
    const r = draft()
    expect(r.state).toBe('drafted')
    if (r.state !== 'drafted') return
    expect(r.letter.heldBecause).toEqual([])
    expect(r.letter.subject).toBe(`Re: ${THREAD}`)
    expect(r.letter.content).toBe(
      [
        'Hi Melbourne Recital Centre team,',
        `A quick follow up on A Ceremony of Carols on Saturday 12 December, listed on EventLinqs: ${ORIGIN}/events/a-ceremony-of-carols-melbourne-recital-centre-2026-12-12`,
        "If you'd like to claim the listing for free, keep its details up to date and sell tickets directly, just reply and I'll set it up.",
      ].join('\n\n'),
    )
    expect(r.letter.closing).toBe(`Kind regards,\nLawal Adams\nFounder, EventLinqs\n\nIf you'd rather I didn't write again, just reply and say so, or unsubscribe here: ${UNSUB}`)
    const voice = voiceProblems(
      {
        ...touchVoiceMessage({
          channel: 'email',
          purpose: 'cadence',
          step: 2,
          address: 'boxoffice@melbournerecital.com.au',
          subject: r.letter.subject,
          body: r.letter.body,
          personName: null,
          organiserName: 'Melbourne Recital Centre',
          firstTouchId: 'the-offer',
          subtype: 'ACQ-FOLLOWUP',
        }),
        from: LAWAL_MAILBOX,
        consent: { basis: 'conspicuous_publication', publishedOnUrl: 'https://www.melbournerecital.com.au/contact', noMarketingStatementChecked: true },
        eventDate: '2026-12-12',
        landsOn: '2026-11-28',
      },
      readVoicePolicy(),
    )
    expect(voice).toEqual([])
  })
  it("a thread subject that already says 'Re:' is answered once, never 'Re: Re:'", () => {
    const r = draft({ threadSubject: `Re: ${THREAD}` })
    expect(r.state === 'drafted' ? r.letter.subject : '').toBe(`Re: ${THREAD}`)
  })
  it('no stock pleasantry and no countdown, as the standard rules (the template itself)', () => {
    expect(`${LIFECYCLE_ACQ_FOLLOW_UP.subject}\n${LIFECYCLE_ACQ_FOLLOW_UP.body}`).not.toMatch(/\bI hope\b|\bdays? to\b|\[days\]/i)
    expect(LIFECYCLE_ACQ_FOLLOW_UP).toMatchObject({ key: ACQ_FOLLOW_UP_KEY, purpose: 'cadence', step: 2, channel: 'email' })
  })
})

describe("2. only on its night's clock, once, and never after a reply", () => {
  it('not before T-14, nor before four days have passed since the offer', () => {
    const friday = draft({ now: new Date('2026-11-26T20:00:00Z') }) // Friday 27 November, 07:00: T-15
    expect(friday.state === 'not drafted' ? friday.why : '').toMatch(/^not due on the event's clock/)
    const soon = draft({ record: { ...QUIET, offerSentAt: '2026-11-25T20:05:00Z' } }) // offered Thursday 26: only two days
    expect(soon.state).toBe('not drafted')
  })
  it('never inside T-7, and never on or after the night', () => {
    expect(draft({ now: new Date('2026-12-04T20:00:00Z') }).state).toBe('not drafted') // Saturday 5 December: T-7
    const after = draft({ now: new Date('2026-12-13T20:00:00Z') })
    expect(after.state === 'not drafted' ? after.why : '').toMatch(/^expired/)
  })
  it('a reply, a follow up already gone, an ineligible contact or an offer not gone: no follow up', () => {
    expect(draft({ record: { ...QUIET, replied: true } }).state).toBe('not drafted')
    expect(draft({ record: { ...QUIET, followUpSentAt: '2026-11-27T20:00:00Z' } }).state).toBe('not drafted')
    expect(draft({ record: { ...QUIET, eligible: false } }).state).toBe('not drafted')
    expect(draft({ record: { ...QUIET, offerSentAt: null } }).state).toBe('not drafted')
  })
})

describe('the signature the gateway asks for: the ABN block on a first contact alone', () => {
  it('a relationship message (the results note to a partner) and a follow up sign as Lawal replies; a first contact carries the block', async () => {
    const { renderTemplate } = await import('@/lib/outreach/rules')
    const body = 'Hi [first name],\nA line about their night.\nKind regards,\n[signature]\n\n[unsubscribe]'
    const sign = (purpose: 'relationship' | 'cadence' | 'reply', step: number | null) =>
      renderTemplate({ channel: 'email', purpose, step, subject: 'A subject', body }, { 'first name': 'Jennifer' }, UNSUB).body
    expect(sign('relationship', null)).not.toContain('ABN')
    expect(sign('relationship', null)).toContain('Kind regards,\nLawal Adams\nFounder, EventLinqs\n\n')
    expect(sign('cadence', 2)).not.toContain('ABN')
    expect(sign('reply', null)).not.toContain('ABN')
    expect(sign('cadence', 1)).toContain('ABN 30 837 447 587')
  })
})

describe('3. each in its first letter\'s class, and the planner drafts them for a law 49 play', () => {
  it('PERM-REMINDER for the photo request\'s, ACQ-FOLLOWUP for the offer\'s (law 24)', () => {
    expect(TEMPLATE_CLASS[PERM_FOLLOW_UP_KEY]).toEqual({ category: 'PERM', subtype: 'PERM-REMINDER' })
    expect(TEMPLATE_CLASS[ACQ_FOLLOW_UP_KEY]).toEqual({ category: 'ACQ', subtype: 'ACQ-FOLLOWUP' })
  })
  it('names the night from its first letter\'s context, or none', async () => {
    const { eventOfContext, FOLLOW_UP_SUBTYPE } = await import('@/lib/outreach/lifecycle-follow-up')
    expect(eventOfContext('event:3f6f2d8e-5c1b-4a7e-9d2c-1b2a3c4d5e6f')).toBe('3f6f2d8e-5c1b-4a7e-9d2c-1b2a3c4d5e6f')
    expect(eventOfContext('play:3f6f2d8e-5c1b-4a7e-9d2c-1b2a3c4d5e6f')).toBeNull()
    expect(eventOfContext(null)).toBeNull()
    expect(FOLLOW_UP_SUBTYPE).toEqual({ lifecycle_perm: 'PERM-REMINDER', lifecycle_acq: 'ACQ-FOLLOWUP' })
  })
  it("the planner drafts a law 49 play's follow up from its step 2 template, on the clock, and only with one", () => {
    const planner = readFileSync('src/lib/outreach/planner.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(planner).toContain('if (lifecycle && play.step2_template_id && base) {')
    expect(planner).toContain('draftLifecycleFollowUp(db, {')
    expect(planner).toContain('templateId: play.step2_template_id,')
  })
})
