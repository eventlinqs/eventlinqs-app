import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REPORT_UNSUBSCRIBE_URL,
  figureLines,
  reportTiming,
  sellThroughMessage,
  type ReportFacts,
} from '../../../src/lib/listings/sell-through-report-words'
import { readVoicePolicy, voiceProblems } from '../../../src/lib/outreach/voice-gate'
import { BROADCAST_FLAG_DEFAULTS } from '../../../src/lib/flags/broadcast'
import { MESSAGE_TYPES } from '../../../src/lib/notifications/recipient-matrix'
import { SEND_PATHS } from '../../../src/lib/consent/send-paths'
import { FOUNDING_INITIAL_MONTHS_WORD } from '../../../src/lib/payments/founding-waiver'
import { OFFERS_CONSENT_WORDS, judgeSubmission } from '../../../src/lib/listings/submission'

/**
 * THE SELL-THROUGH REPORT (Lawal's ruling of 8 November 2026, 16:13, build 3): the day after a listed event ends, its
 * organiser hears what EventLinqs counted for it, from counted figures only, in his first-message form, through the
 * gateway's own checks; the invitation to sell the next event only on the organiser's recorded yes.
 */
const FROM = 'EventLinqs <hello@eventlinqs.com>'
const SIGNATURE = readVoicePolicy().replySignature
const KYIVSKA: ReportFacts = {
  to: 'iryna@example.com',
  name: 'Iryna Karanets',
  title: 'Kyivska Perepichka: Ukrainian Theatre in Melbourne',
  venue: 'The Wheeler Centre',
  figures: { viewers: 214, saves: 9, reminders: 3, wentToBooking: 41 },
  mayOffer: false,
  origin: 'https://www.eventlinqs.com.au',
}
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

describe('when the report goes: the day after, in the morning, where it happened', () => {
  // Kyivska Perepichka ends Saturday 5 December 2026 at 9:00 pm in Melbourne (AEDT, UTC+11): 10:00 UTC.
  const END = '2026-12-05T10:00:00Z'
  const TZ = 'Australia/Melbourne'
  test('not before it ends, and not later that same night', () => {
    expect(reportTiming(END, TZ, new Date('2026-12-05T09:00:00Z'))).toEqual({ due: false, why: 'the event has not ended', settle: false })
    expect(reportTiming(END, TZ, new Date('2026-12-05T12:30:00Z'))).toMatchObject({ due: false, settle: false })
  })
  test('not in the small hours of the next day, and due from 9 am Melbourne time', () => {
    expect(reportTiming(END, TZ, new Date('2026-12-05T19:00:00Z'))).toMatchObject({ due: false, why: 'before 9 am where it happened' })
    expect(reportTiming(END, TZ, new Date('2026-12-05T22:00:00Z'))).toEqual({ due: true })
  })
  test('in Perth the next day starts by Perth time, not Melbourne time', () => {
    // 9:00 pm Saturday in Perth (AWST, UTC+8) is 13:00 UTC; 9 am Sunday in Perth is 01:00 UTC Sunday.
    expect(reportTiming('2026-12-05T13:00:00Z', 'Australia/Perth', new Date('2026-12-06T00:30:00Z'))).toMatchObject({ due: false })
    expect(reportTiming('2026-12-05T13:00:00Z', 'Australia/Perth', new Date('2026-12-06T01:00:00Z'))).toEqual({ due: true })
  })
  test('a week on it is settled as too late rather than sent', () => {
    expect(reportTiming(END, TZ, new Date('2026-12-13T00:00:00Z'))).toEqual({ due: false, why: 'the event ended over 7 days ago', settle: true })
  })
})

describe('counted figures only, a zero left out, nothing sent when nothing was counted', () => {
  test('each counted figure is a line about people, in the order a visitor goes', () => {
    expect(figureLines(KYIVSKA.figures)).toEqual([
      '214 people opened its page.',
      '9 people saved it.',
      '3 people asked us to remind them before it started.',
      '41 people went on from it to your booking page.',
    ])
    expect(figureLines({ viewers: 1, saves: 0, reminders: 0, wentToBooking: 1 })).toEqual(['1 person opened its page.', '1 person went on from it to your booking page.'])
  })
  test('nothing counted means no message at all', () => {
    expect(sellThroughMessage({ ...KYIVSKA, figures: { viewers: 0, saves: 0, reminders: 0, wentToBooking: 0 } }, FROM, SIGNATURE)).toBeNull()
  })
  test('a press out is never called a sale', () => {
    const body = sellThroughMessage(KYIVSKA, FROM, SIGNATURE)?.body ?? ''
    expect(body).not.toMatch(/sold|sales|bought tickets|ticket sales/i)
    expect(body).toContain('We can see who went on to your booking page, but not what they bought there.')
  })
})

describe("Lawal's service form, passing every one of the gateway's checks", () => {
  test('without the offer: greeting, warm line, the figures, his signature and the opt out', () => {
    const msg = sellThroughMessage(KYIVSKA, FROM, SIGNATURE)
    expect(msg).not.toBeNull()
    const lines = (msg?.body ?? '').split('\n')
    expect(lines[0]).toBe('Hi Iryna,')
    expect(lines[2]).toBe("I hope you're well, and that Kyivska Perepichka: Ukrainian Theatre in Melbourne at The Wheeler Centre was a great night.")
    expect(msg?.category).toBe('service')
    expect(msg?.subject).toBe('How Kyivska Perepichka: Ukrainian Theatre in Melbourne did on EventLinqs')
    expect(msg?.body).toContain('Kind regards,\nLawal Adams\nFounder, EventLinqs\n')
    expect(msg?.body).not.toContain('ABN')
    expect(msg?.body).toContain(`unsubscribe here: ${REPORT_UNSUBSCRIBE_URL}`)
    expect(msg?.body).not.toMatch(/sell on EventLinqs|platform fee|\/start/)
    expect(voiceProblems(msg!, readVoicePolicy())).toEqual([])
  })
  test("with the organiser's recorded yes: the one offer line, its months read from the offer module, and the door", () => {
    const msg = sellThroughMessage({ ...KYIVSKA, mayOffer: true }, FROM, SIGNATURE)
    expect(msg?.body).toContain(`no platform fee for your first ${FOUNDING_INITIAL_MONTHS_WORD} months from the day you register:`)
    expect(msg?.body).toContain('https://www.eventlinqs.com.au/start?src=report')
    expect(voiceProblems(msg!, readVoicePolicy())).toEqual([])
  })
  test("the gateway holds a report it would not let Lawal send: a spaced hyphen in the event's own title", () => {
    const msg = sellThroughMessage({ ...KYIVSKA, title: 'Kyivska Perepichka - Melbourne' }, FROM, SIGNATURE)
    expect(voiceProblems(msg!, readVoicePolicy()).join(' ')).toMatch(/dash|hyphen/i)
  })
  test('the offer months are never typed in the words module (LAW 24)', () => {
    expect(read('src/lib/listings/sell-through-report-words.ts')).not.toMatch(/\b(six|6) months\b/i)
  })
})

describe("the organiser's yes is asked, never assumed, and kept with its words", () => {
  const BASE = {
    name: 'Iryna Karanets', email: 'Iryna@Example.com ', role: 'organiser', title: 'Kyivska Perepichka', startsLocal: '2026-12-05T18:30',
    endsLocal: '2026-12-05T21:00', venueName: 'The Wheeler Centre', venueAddress: '176 Little Lonsdale Street, Melbourne', city: 'melbourne',
    bookingUrl: 'https://www.trybooking.com/au/events/landing/1660299', entry: 'paid', price: '80', description: '', hasPhoto: false,
    photoOwned: false, authority: true, permission: true,
  }
  const NOW = new Date('2026-11-09T00:00:00Z')
  test('a tick keeps the exact words and the moment; no tick keeps nothing', () => {
    const yes = judgeSubmission({ ...BASE, offers: true }, NOW)
    expect(yes.ok && yes.row.offers_consent_words).toBe(OFFERS_CONSENT_WORDS)
    expect(yes.ok && yes.row.offers_consent_at).toBe(NOW.toISOString())
    const no = judgeSubmission({ ...BASE, offers: false }, NOW)
    expect(no.ok && 'offers_consent_words' in no.row).toBe(false)
    const before = judgeSubmission(BASE, NOW)
    expect(before.ok && 'offers_consent_at' in before.row).toBe(false)
  })
  test('the box on the form is never ticked for them and never required', () => {
    const page = read('src/app/submit-event/page.tsx')
    const box = page.match(/<input type="checkbox" name="offers"[^>]*\/>/)?.[0] ?? ''
    expect(box).not.toBe('')
    expect(box).not.toMatch(/checked|required/)
    expect(page).toContain('{OFFERS_CONSENT_WORDS}')
  })
})

describe('switched, declared, classified, and ridden by an existing run', () => {
  test("ON by Lawal's ruling, declared for the organiser, and the send asks the switch first", () => {
    expect(BROADCAST_FLAG_DEFAULTS.organiser_report_email).toBe(true)
    expect(MESSAGE_TYPES.find((m) => m.type === 'organiser_sell_through_report')?.roles).toEqual(['organiser'])
    const sender = read('src/lib/listings/sell-through-report.ts')
    expect(sender.indexOf("isFeatureEnabled('organiser_report_email')")).toBeGreaterThan(-1)
    expect(sender.indexOf("isFeatureEnabled('organiser_report_email')")).toBeLessThan(sender.indexOf('sendEmail({'))
  })
  test('never to an unsubscribed address, claimed before it sends, and the gateway judges before the claim', () => {
    const sender = read('src/lib/listings/sell-through-report.ts')
    expect(sender).toContain("from('outreach_unsubscribes')")
    const order = ['await unsubscribed(admin', 'voiceProblems(msg', 'await claim(admin', 'sendEmail({'].map((s) => sender.indexOf(s))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  test('classified with its reason, and run by the hourly listing run (no cron added)', () => {
    expect(SEND_PATHS.find((p) => p.file === 'src/lib/listings/sell-through-report.ts')?.purpose).toBe('organiser_operations')
    expect(read('src/app/api/cron/listing-occurrences/route.ts')).toContain('await sendSellThroughReports(new Date())')
    expect(read('vercel.json')).not.toMatch(/sell-through|sell_through/)
  })
})
