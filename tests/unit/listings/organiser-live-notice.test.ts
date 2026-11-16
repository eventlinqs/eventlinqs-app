import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { firstName, liveNoticeMessage } from '../../../src/lib/listings/organiser-live-notice-words'
import { readVoicePolicy, voiceProblems } from '../../../src/lib/outreach/voice-gate'
import { BROADCAST_FLAG_DEFAULTS } from '../../../src/lib/flags/broadcast'
import { MESSAGE_TYPES } from '../../../src/lib/notifications/recipient-matrix'

/**
 * THE ORGANISER'S OWN "YOUR EVENT IS LIVE" EMAIL (the PM's ruling of 8 November 2026, 15:00, item 3): Lawal's format,
 * judged by the gateway's own checks (the platform's line for line port, src/lib/outreach/voice-gate.ts, on the policy
 * generated from his two files); ON by his ruling of 16:13 (2), organiser_live_email turning it off.
 */
const FROM = 'EventLinqs <hello@eventlinqs.com>'
const SNOTBOTTOM = {
  to: 'mark@example.com',
  name: 'Mark Trenwith',
  title: "Mr Snotbottom's Stinky Silly Show",
  when: 'Saturday 28 November at 11:30 am',
  venue: 'Harmonie German Club',
  link: 'https://www.eventlinqs.com.au/events/mr-snotbottom-s-stinky-silly-show-harmonie-german-club-2026-11-28',
}

describe("the organiser's live notice", () => {
  test("greets the organiser by the first name they gave, and passes every one of the gateway's checks", () => {
    expect(firstName('Iryna Karanets')).toBe('Iryna')
    expect(firstName('Agostina')).toBe('Agostina')
    const msg = liveNoticeMessage(SNOTBOTTOM, FROM)
    expect(msg.body.split('\n')[0]).toBe('Hi Mark,')
    expect(msg.category).toBe('service')
    expect(voiceProblems(msg, readVoicePolicy())).toEqual([])
  })
  test("the gateway holds a notice it would not let Lawal send: a spaced hyphen in the organiser's own title", () => {
    const msg = liveNoticeMessage({ ...SNOTBOTTOM, title: 'Stinky Silly Show - Canberra' }, FROM)
    expect(voiceProblems(msg, readVoicePolicy()).join(' ')).toMatch(/dash|hyphen/i)
  })
  test("it is ON by Lawal's ruling of 16:13, declared for the organiser, and the send asks the switch first", () => {
    expect(BROADCAST_FLAG_DEFAULTS.organiser_live_email).toBe(true)
    const declared = MESSAGE_TYPES.find((m) => m.type === 'organiser_live_notice')
    expect(declared?.roles).toEqual(['organiser'])
    const send = readFileSync(join(process.cwd(), 'src/lib/listings/organiser-live-notice.ts'), 'utf8').replace(/\r\n/g, '\n')
    const body = send.slice(send.indexOf('export async function sendOrganiserLiveNotice'))
    const asked = body.indexOf("await isFeatureEnabled('organiser_live_email')")
    const gated = body.indexOf('voiceProblems(msg, readVoicePolicy())')
    const sent = body.indexOf('await sendEmail(')
    expect(asked).toBeGreaterThan(-1)
    expect(gated).toBeGreaterThan(asked)
    expect(sent).toBeGreaterThan(gated)
  })
  test("self-listing tells the organiser once it is live, and Lawal's alert says what happened", () => {
    const run = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8').replace(/\r\n/g, '\n')
    const published = run.indexOf("update({ status: 'published'")
    const told = run.indexOf('await sendOrganiserLiveNotice({ to: sub.email')
    expect(told).toBeGreaterThan(published)
    // The PM's 22:41 (b): a live notice held for one submission (H2o) is not sent, and the run's log says why.
    expect(run).toMatch(/const organiserTold = noticeHeld\s*\?\s*'not sent: its live notice is held for this submission/)
    expect(run).toContain('Organiser told: ${organiserTold}')
  })
  test('a held notice survives the run holding the submission again (16 November 2026, H2o at 13:11)', () => {
    // The run's hold rewrote check_result whole and dropped notice_held, so the next release would have published H2o and
    // sent Joe his notice. Every check_result the run writes starts from one that keeps a held notice.
    const run = readFileSync(join(process.cwd(), 'src/lib/listings/self-listing-run.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(run).toMatch(/const checkResult = \{ \.\.\.\(noticeHeld \? \{ notice_held: true \} : \{\}\),/)
  })
})
