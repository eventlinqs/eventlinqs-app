import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventSlugOf, letterExpiry, type LetterEvent } from '@/lib/outreach/event-validity'

/*
 * A LETTER IS SENT ONLY WHILE THE EVENT IT NAMES MAKES IT TRUE (Lawal, 19:13 of 22 November 2026, section 11; the PM's
 * 19:13, item 8). Red on main: src/lib/outreach/event-validity.ts does not exist there, the sender re-read the event only
 * for segment A and the law 49 letters, and nothing voided a held or queued letter whose event had passed.
 */

const MEL = 'Australia/Melbourne'
// A gig at 8pm on Saturday 28 November 2026, Melbourne.
const GIG: LetterEvent = { startDate: '2026-11-28T09:00:00Z', endDate: '2026-11-28T13:00:00Z', status: 'published', timezone: MEL }

describe('a letter naming an event, read against it at the moment of sending', () => {
  it('names its event by its /events/ page', () => {
    expect(eventSlugOf('Your night is live: https://www.eventlinqs.com.au/events/harbour-lights-2026?utm=x')).toBe('harbour-lights-2026')
    expect(eventSlugOf('No page here.')).toBeNull()
  })

  it('an invitation about an event still to come goes; on its day, or after it, it never goes as though upcoming', () => {
    expect(letterExpiry('twenty_offer', GIG, new Date('2026-11-26T22:00:00Z'))).toBeNull()
    expect(letterExpiry('twenty_offer', GIG, new Date('2026-11-27T22:00:00Z'))).toMatch(/^expired: the event it names starts 2026-11-28, and no message about an event lands on or after its day/)
    expect(letterExpiry('follow_up', GIG, new Date('2026-11-30T22:00:00Z'))).toMatch(/^expired: /)
  })

  it('a reminder or follow up after its deadline: never sent', () => {
    expect(letterExpiry('twenty_day10', GIG, new Date('2026-11-29T00:00:00Z'))).toMatch(/^expired: /)
  })

  it('a cancelled, postponed or removed event: never sent', () => {
    expect(letterExpiry('first_contact', { ...GIG, status: 'cancelled' }, new Date('2026-11-20T00:00:00Z'))).toBe('expired: the event it names is cancelled; set aside, never sent')
    expect(letterExpiry('first_contact', { ...GIG, status: 'postponed' }, new Date('2026-11-20T00:00:00Z'))).toMatch(/postponed/)
    expect(letterExpiry('first_contact', null, new Date('2026-11-20T00:00:00Z'))).toMatch(/no longer listed/)
  })

  it('the after your night report goes inside its own window only, after the night (not before it is due, not past seven days)', () => {
    expect(letterExpiry('after_your_night', GIG, new Date('2026-12-01T00:00:00Z'))).toBeNull()
    expect(letterExpiry('after_your_night', GIG, new Date('2026-12-06T00:00:00Z'))).toMatch(/^expired: the night ended 7 days ago, too late to report/)
  })

  it("a reply to the organiser's own message is never held back by its event's date", () => {
    expect(letterExpiry('reply_take_down', GIG, new Date('2026-12-10T00:00:00Z'))).toBeNull()
  })
})

describe('the sweep and the send path', () => {
  const sender = readFileSync('src/lib/outreach/sender.ts', 'utf8')
  const route = readFileSync('src/app/api/cron/outreach-run/route.ts', 'utf8')

  it('every other letter naming an event is read again at send time and voided with its reason', () => {
    expect(sender).toMatch(/const named = eventSlugOf\(t\.body \?\? ''\)/)
    expect(sender).toMatch(/return letterExpiry\(key, row \? \{ startDate: row\.start_date, endDate: row\.end_date, status: row\.status, timezone: row\.timezone \} : null, now\)/)
  })

  it('the sweep voids held and queued letters only, with the reason, and never touches the organiser contact', () => {
    const sweep = sender.slice(sender.indexOf('export async function expireLapsedLetters'))
    expect(sweep).toMatch(/\.in\('state', \['held', 'queued'\]\)/)
    expect(sweep).toMatch(/update\(\{ state: 'void', void_reason: why\.slice\(0, 480\) \}\)/)
    expect(sweep).not.toMatch(/organiser_contacts/)
  })

  it('the run sweeps first, isolated, before anything queues or sends', () => {
    const at = route.indexOf("isolated(RUN, 'the expiry sweep of held and queued letters'")
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(route.indexOf('await queueApprovedHeldLetters(db, { now })'))
    expect(at).toBeLessThan(route.indexOf('await runOutreachSender(db, { now, origin, graph })'))
    expect(route).toMatch(/partners, recheck, lapsed\]\.filter\(isStepFault\)/)
  })
})
