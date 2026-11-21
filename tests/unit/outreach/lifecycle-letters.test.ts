import { describe, expect, it } from 'vitest'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'
import { renderTemplate } from '@/lib/outreach/rules'
import { touchVoiceMessage } from '@/lib/outreach/touch-voice'
import { readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'
import { startOfLocalDayUtcOffset } from '@/lib/events/listing-window'
import {
  LIFECYCLE_ACQ,
  LIFECYCLE_LETTERS,
  LIFECYCLE_PERM,
  LIFECYCLE_SUBTYPE,
  isLifecycleKey,
  lifecycleChoice,
  lifecycleFields,
  lifecycleStillAsks,
  photoSourceWords,
  type LifecycleFacts,
  type LifecycleKey,
  type LifecycleNightClock,
} from '@/lib/outreach/lifecycle-letters'

/*
 * LAW 49'S TWO LETTERS (Lawal, 21 November 2026, 09:20; C:\dev\START-16OCT\EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md). The
 * PM's 09:23 words as fixed through the gateway (r2) with Lawal's 09:25 go, PERM carrying the one tap photo link (the
 * PM's 13:01, item 3), filled with the real night the r2 samples used (Gallery Tots, Geelong Gallery, Friday 11 December
 * 2026, tickets on Humanitix) and judged by every CRM rule and the gateway's own checks. Then the clock decides: a fake
 * organiser's nights are walked from far off to inside T-7.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000`
const PHOTO = `${ORIGIN}/photos/00000000-0000-0000-0000-000000000000/00000000000000000000000000000000`
const MON_23_7AM = new Date('2026-11-22T20:00:00Z') // Monday 23 November, 07:00 in Melbourne: law 44's window
const TOTS: LifecycleFacts = {
  organiserName: 'Geelong Gallery',
  personName: null,
  websiteUrl: 'https://www.geelonggallery.org.au',
  night: {
    title: 'Gallery Tots',
    slug: 'gallery-tots-geelong-gallery-2026-12-11',
    startDate: '2026-12-10T23:00:00Z', // Friday 11 December, 10am in Geelong
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    bookingUrl: 'https://events.humanitix.com/gallery-tots-december',
  },
  photoLink: PHOTO,
  origin: ORIGIN,
}
const CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://www.geelonggallery.org.au/contact', noMarketingStatementChecked: true }

function gate(key: LifecycleKey, subject: string | null, body: string) {
  return voiceProblems(
    {
      ...touchVoiceMessage({
        channel: 'email',
        purpose: 'cadence',
        step: 1,
        address: 'info@geelonggallery.org.au',
        subject,
        body,
        personName: null,
        organiserName: 'Geelong Gallery',
        firstTouchId: null,
        subtype: LIFECYCLE_SUBTYPE[key],
      }),
      consent: CONSENT,
      eventDate: '2026-12-11',
      landsOn: '2026-11-23',
    },
    readVoicePolicy(),
  )
}

describe("law 49's two letters, filled with a real night", () => {
  it('PERM asks for the photo on their seller page, with the one tap link, and passes every rule and the gateway', () => {
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(TOTS, MON_23_7AM), UNSUB)
    expect(r.heldBecause).toEqual([])
    expect(r.subject).toBe('Your Gallery Tots listing on EventLinqs: may we use your photo?')
    expect(r.body).toContain("Gallery Tots on Friday 11 December is now listed free on EventLinqs, the what's on guide for Geelong: https://www.eventlinqs.com.au/events/gallery-tots-geelong-gallery-2026-12-11")
    expect(r.body).toContain("With 18 days to go, we'd like to show it properly")
    expect(r.body).toContain('the one on your Humanitix page.')
    expect(r.body).toContain(`Could you reply yes to let us use it for your listing and its promotion? If you'd rather use a different photo, just send it, or add it here in one tap: ${PHOTO}`)
    expect(r.body.startsWith('Hi Geelong Gallery team,\n\nI hope you\'re well.\n\n')).toBe(true)
    expect(gate('lifecycle_perm', r.subject, r.body)).toEqual([])
  })

  it('ACQ offers the free listing on the clock, names only the guide, carries no photo link, and passes every rule and the gateway', () => {
    const r = renderTemplate(LIFECYCLE_ACQ, lifecycleFields(TOTS, MON_23_7AM), UNSUB)
    expect(r.heldBecause).toEqual([])
    expect(r.subject).toBe("18 days to Gallery Tots: let's fill it")
    expect(r.body).toContain('on the Geelong guide.')
    expect(r.body).not.toContain('/photos/')
    expect(r.body).not.toMatch(/newsletter|Instagram|Facebook/)
    expect(gate('lifecycle_acq', r.subject, r.body)).toEqual([])
  })

  it('a fact we do not hold leaves the draft held, never a stand in', () => {
    const noPage = lifecycleFields({ ...TOTS, night: { ...TOTS.night, bookingUrl: 'https://tickets.example-seller.net/x' } }, MON_23_7AM)
    expect(noPage['photo source']).toBeNull()
    expect(renderTemplate(LIFECYCLE_PERM, noPage, UNSUB).heldBecause.join(' ')).toContain('[photo source]')
    const noLink = lifecycleFields({ ...TOTS, photoLink: null }, MON_23_7AM)
    expect(renderTemplate(LIFECYCLE_PERM, noLink, UNSUB).heldBecause.join(' ')).toContain('[photo link]')
    const noCity = lifecycleFields({ ...TOTS, night: { ...TOTS.night, citySlug: null } }, MON_23_7AM)
    expect(renderTemplate(LIFECYCLE_ACQ, noCity, UNSUB).heldBecause.join(' ')).toContain('[city]')
  })

  it('the seller is named by its own name, their own site as their website, anything else not at all', () => {
    expect(photoSourceWords('https://events.humanitix.com/x', null)).toBe('your Humanitix page')
    expect(photoSourceWords('https://www.eventbrite.com.au/e/x', null)).toBe('your Eventbrite page')
    expect(photoSourceWords('https://www.trybooking.com/ABCD', null)).toBe('your TryBooking page')
    expect(photoSourceWords('https://tickets.geelonggallery.org.au/x', 'https://www.geelonggallery.org.au')).toBe('your website')
    expect(photoSourceWords('https://www.facebook.com/events/1', 'https://www.geelonggallery.org.au')).toBeNull()
    expect(photoSourceWords(null, 'https://www.geelonggallery.org.au')).toBeNull()
  })

  it('each letter is a first letter of its own class, stored by its key, with its source and Lawal\'s go recorded', () => {
    for (const l of LIFECYCLE_LETTERS) {
      expect(isLifecycleKey(l.key)).toBe(true)
      expect(TEMPLATE_CLASS[l.key].subtype).toBe(LIFECYCLE_SUBTYPE[l.key])
      expect(l.step).toBe(1)
      expect(l.source).toContain("Yep, good work. We can perfect everything later. Good work, just finish it up.")
      expect(`${l.subject}\n${l.body}`).not.toMatch(/[\u2013\u2014]| - /)
    }
    expect(LIFECYCLE_PERM.source).toContain("13:01")
    expect(isLifecycleKey('segment_a_first')).toBe(false)
  })
})

describe('the clock decides which night, and whether today', () => {
  const ZONE = 'Australia/Melbourne'
  // A night on Saturday 26 December 2026, 8pm in Melbourne; mornings counted back from it at 07:00 local.
  const START = '2026-12-26T09:00:00Z'
  const night = (over: Partial<LifecycleNightClock> = {}): LifecycleNightClock => ({ eventId: 'n1', startIso: START, endIso: '2026-12-26T12:00:00Z', zone: ZONE, granted: false, ...over })
  const daysBefore = (n: number) => new Date(startOfLocalDayUtcOffset(new Date(START), ZONE, -n).getTime() + 7 * 3_600_000)
  const due = (key: LifecycleKey, days: number, over: Partial<{ replied: boolean; alreadyAsked: boolean; nights: LifecycleNightClock[] }> = {}) =>
    lifecycleChoice(key, { replied: false, alreadyAsked: false, nights: [night()], ...over }, daysBefore(days))

  it('far off, nothing; PERM from T-28, ACQ from T-21; found late both are due the same day, as two letters', () => {
    expect(due('lifecycle_perm', 40).due).toBe(false)
    expect(due('lifecycle_perm', 28)).toEqual({ due: true, eventId: 'n1', daysToStart: 28 })
    expect(due('lifecycle_acq', 28).due).toBe(false)
    expect(due('lifecycle_acq', 21)).toEqual({ due: true, eventId: 'n1', daysToStart: 21 })
    expect(due('lifecycle_perm', 10).due).toBe(true)
    expect(due('lifecycle_acq', 10).due).toBe(true)
  })

  it('no new ask inside T-7, and nothing on the night', () => {
    for (const d of [7, 5, 3, 1, 0]) {
      expect(due('lifecycle_perm', d).due, `PERM at T-${d}`).toBe(false)
      expect(due('lifecycle_acq', d).due, `ACQ at T-${d}`).toBe(false)
    }
    expect(lifecycleStillAsks(START, ZONE, daysBefore(8))).toBe(true)
    expect(lifecycleStillAsks(START, ZONE, daysBefore(7))).toBe(false)
  })

  it('a reply, or a letter of the same kind already gone, ends it; the reason is said', () => {
    const r = due('lifecycle_acq', 14, { replied: true })
    expect(r.due).toBe(false)
    expect(r.due ? '' : r.why).toContain('replied')
    const a = due('lifecycle_perm', 20, { alreadyAsked: true })
    expect(a.due ? '' : a.why).toContain('PERM-IMAGE')
  })

  it("a night already showing the organiser's own photograph needs no PERM, so the next night is asked for", () => {
    const later: LifecycleNightClock = night({ eventId: 'n2', startIso: '2027-01-02T09:00:00Z', endIso: '2027-01-02T12:00:00Z' })
    const r = due('lifecycle_perm', 20, { nights: [night({ granted: true }), later] })
    expect(r).toEqual({ due: true, eventId: 'n2', daysToStart: 27 })
    const none = due('lifecycle_perm', 20, { nights: [night({ granted: true })] })
    expect(none.due).toBe(false)
    // ACQ is not about the photograph: the granted night still gets its offer.
    expect(due('lifecycle_acq', 20, { nights: [night({ granted: true })] })).toEqual({ due: true, eventId: 'n1', daysToStart: 20 })
  })

  it('no night listed ahead, no letter', () => {
    const r = due('lifecycle_perm', 20, { nights: [] })
    expect(r.due ? '' : r.why).toContain('no public night')
  })
})
