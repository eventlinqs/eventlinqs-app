import { describe, expect, it } from 'vitest'
import { buildReminderEmail } from '@/lib/walk-in/reminder-messages'
import { runReminderPasses, type DueRow, type ReminderKind, type ReminderSendDeps } from '@/lib/walk-in/reminder-sends'
import {
  REMIND_ME_CONSENT_VERSION,
  REMIND_ME_PRIVACY_LINE,
  remindMeConsentText,
  remindMePurpose,
} from '@/lib/walk-in/remind-me'
import { SEND_PATHS } from '@/lib/consent/send-paths'
import { isDeclaredMessageType } from '@/lib/notifications/recipient-matrix'

/**
 * REMIND ME KEEPS THE PRIVACY POLICY'S PROMISES (the version of 27 October 2026,
 * approved by Lawal at 21:37; the project manager's 21:38 and 21:51 (B)):
 * "We send you at most two messages, the full program once ... and one reminder
 * the day before, plus a short note if the event is called off. We never use the
 * address for marketing." Before this, no called-off note existed at all.
 */

const facts = (kind: ReminderKind) =>
  buildReminderEmail({
    kind,
    origin: 'https://www.eventlinqs.com.au',
    token: '00000000-0000-4000-8000-0000000000aa',
    event: {
      title: 'Harbour Night Market',
      slug: 'harbour-night-market-2026-11-06',
      venueName: 'The Harbour Hall',
      venueCity: 'Geelong',
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-38.14%2C144.36',
    },
    organiserName: 'Harbour Hall',
    days: [{ date: '2026-11-06', opens: '17:00', closes: '22:00', hours_label: null, items: [{ when: '5pm', what: 'Stalls open' }], closer: null }] as never,
  })

const KINDS: ReminderKind[] = ['program', 'day_before', 'called_off']

/** Every address an email links to, from its HTML. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))

describe('the called-off note', () => {
  it('says the event is off, by name, and that this is the last message', () => {
    const e = facts('called_off')
    expect(e.subject).toBe('Called off: Harbour Night Market')
    expect(e.text).toContain('will not go ahead. Harbour Hall has called it off.')
    expect(e.text).toContain('This is the last message you will get about it.')
  })

  it('carries no hours, no directions and no "free entry" line: there is nothing to turn up to', () => {
    const e = facts('called_off')
    expect(e.text).not.toContain('5pm')
    expect(e.text).not.toContain('Get directions')
    expect(e.text).not.toMatch(/no ticket needed/i)
  })

  it('is one more pass of the hourly run, after the program and the day-before reminder', async () => {
    const asked: ReminderKind[] = []
    const row: DueRow = { reminderId: 'r1', email: 'a@example.com', token: 't', eventId: 'e1', firstDay: '2026-11-06', timezone: 'Australia/Melbourne' }
    const deps: ReminderSendDeps = {
      due: async (kind) => {
        asked.push(kind)
        return kind === 'called_off' ? [row] : []
      },
      claim: async () => true,
      send: async () => ({ id: 'm1' }),
      record: async () => {},
      purge: async () => 0,
    }
    const result = await runReminderPasses(deps, new Date('2026-11-01T00:00:00Z'))
    expect(asked).toEqual(['program', 'day_before', 'called_off'])
    expect(result.calledOff.sent).toBe(1)
  })

  it('is a declared message type, so the transport accepts it', () => {
    expect(isDeclaredMessageType('walk_in_called_off')).toBe(true)
  })
})

describe('the operational Remind me emails carry no promotion (Spam Act: factual content alone)', () => {
  for (const kind of KINDS) {
    it(`${kind}: links only to this event, its directions and the one-click stop`, () => {
      const e = facts(kind)
      for (const h of hrefs(e.html)) {
        const ok =
          h === 'https://www.eventlinqs.com.au/events/harbour-night-market-2026-11-06' ||
          h.startsWith('https://www.google.com/maps/dir/') ||
          h.startsWith('https://www.eventlinqs.com.au/remind/stop/')
        expect(ok, h).toBe(true)
      }
      expect(e.html).not.toMatch(/instagram|facebook|tiktok|twitter|linkedin|\/events\?|other events|you might also|recommended/i)
      // The 23:21 (1): "Like this? Get a few picks like it." is promotion and never rides an operational email.
      expect(`${e.html} ${e.text}`).not.toMatch(/picks|like this\?/i)
    })

    it(`${kind}: names EventLinqs as the sender and carries a working one-click stop`, () => {
      const e = facts(kind)
      expect(e.html).toContain('EventLinqs')
      expect(e.html).toContain('Stop these reminders')
      const stops = Object.values(e.headers).join(' ')
      expect(stops).toContain('https://www.eventlinqs.com.au/api/remind/stop/')
    })
  }

  it('Remind me sends from a path registered as operational, never marketing', () => {
    const entry = SEND_PATHS.find((p) => p.file === 'src/lib/walk-in/reminder-store.ts')
    expect(entry?.kind).toBe('transactional')
  })

  it('every send path on the platform is classified one way or the other', () => {
    for (const p of SEND_PATHS) expect(['marketing', 'transactional', 'operations', 'transport'], p.file).toContain(p.kind)
    expect(SEND_PATHS.filter((p) => p.kind === 'marketing').length).toBeGreaterThan(0)
  })
})

describe('Remind me says what it sends, beside the button, with the privacy line (APP 5)', () => {
  it('a new version, whose words name the called-off note', () => {
    expect(REMIND_ME_CONSENT_VERSION).toBe('remind-me-v2-2026-10-27')
    expect(remindMePurpose('Harbour Hall', false)).toContain('a short note if it is called off')
    expect(remindMePurpose('Harbour Hall', true)).toContain('a short note if it is called off')
  })

  it('stores the purpose and the privacy line exactly as shown', () => {
    const purpose = remindMePurpose('Harbour Hall', false)
    expect(remindMeConsentText(purpose)).toBe(`${purpose} ${REMIND_ME_PRIVACY_LINE} Privacy Policy`)
    expect(REMIND_ME_PRIVACY_LINE).toBe("We use your email only for this event's reminders.")
  })
})
