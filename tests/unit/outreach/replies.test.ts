import { describe, expect, test } from 'vitest'
import { CLEAR, HELD_MONEY_OR_CONTRACT, classifyInbound, providerNamed, stripQuoted } from '@/lib/outreach/replies'
import { nightsOf, trueLine, whenItRuns } from '@/lib/outreach/facts'
import { addressRank } from '@/lib/outreach/planner'

/**
 * THE REPLY CLASSIFIER (src/lib/outreach/replies.ts). It acts on a person's words, so the rule tested hardest is the
 * one that protects them: a stop is honoured whatever else the reply says, and nothing acts below CLEAR.
 */

const reply = (text: string, subject = 'Re: your nights', headers: Record<string, string> = {}) =>
  classifyInbound({ subject, fromAddress: 'sam@venue.example', text, headers })

describe('the quoted thread is not read as their words', () => {
  test('Gmail style', () => {
    expect(stripQuoted('Yes please\n\nOn Thu, 29 Oct 2026 at 10:00, Lawal Adams <hello@eventlinqs.com> wrote:\n> Would that work for you?')).toBe('Yes please')
  })
  test('Outlook style', () => {
    expect(stripQuoted('Not interested.\nFrom: Lawal Adams <hello@eventlinqs.com>\nSent: Thursday\nSubject: Your nights')).toBe('Not interested.')
  })
})

describe('a stop is honoured whatever else the reply says', () => {
  test.each([
    'Please unsubscribe me.',
    'STOP',
    'Remove me from your list',
    "Don't email us again",
    'Thanks but please stop emailing. Yes we have heard of you.',
  ])('%s', (text) => {
    const k = reply(text)
    expect(k).toMatchObject({ kind: 'reply', outcome: 'stop', answerKey: 'reply_stop' })
    if (k.kind === 'reply') expect(k.confidence).toBeGreaterThanOrEqual(CLEAR)
  })
  test('a take down is honoured too', () => {
    expect(reply('Please take our listing down.')).toMatchObject({ outcome: 'take_down', answerKey: 'reply_take_down' })
  })
})

describe('clear answers act; anything else waits for Lawal', () => {
  test('a short yes gets message 5', () => {
    const k = reply('Yes please, sounds great.\n\nOn Thu wrote:\n> Would that work for you?')
    expect(k).toMatchObject({ outcome: 'yes', answerKey: 'thank_you' })
    if (k.kind === 'reply') expect(k.confidence).toBeGreaterThanOrEqual(CLEAR)
  })
  test('a no stops the organiser and sends nothing', () => {
    expect(reply('No thanks, not for us.')).toMatchObject({ outcome: 'no', answerKey: null })
  })
  test.each([
    ['How much does it cost?', 'reply_cost'],
    ['We already use Humanitix for tickets.', 'reply_existing_ticketing'],
    ['Who are you?', 'reply_who_are_you'],
    ['Why are we listed on your site?', 'reply_why_listed'],
    ['Maybe later, too busy right now.', 'reply_not_now'],
  ])('%s gets %s', (text, key) => {
    const k = reply(text)
    expect(k).toMatchObject({ kind: 'reply', answerKey: key })
    if (k.kind === 'reply') expect(k.confidence).toBeGreaterThanOrEqual(CLEAR)
  })
  test('a yes that is also a question waits for Lawal', () => {
    const k = reply('Yes maybe, but how much does it cost?')
    expect(k).toMatchObject({ outcome: 'unclear' })
    if (k.kind === 'reply') expect(k.confidence).toBeLessThan(CLEAR)
  })
  test('a person named waits for Lawal to add them', () => {
    const k = reply('You should talk to Pat, pat@venue.example')
    expect(k).toMatchObject({ outcome: 'referred' })
    if (k.kind === 'reply') expect(k.confidence).toBeLessThan(CLEAR)
  })
  test('a long reply is never acted on by the rules alone', () => {
    const k = reply(`Yes. ${'We have a lot to think about with our programme this year and the room is booked most weekends. '.repeat(3)}`)
    if (k.kind === 'reply') expect(k.confidence).toBeLessThan(CLEAR)
  })
  test('nothing recognisable waits for Lawal', () => {
    expect(reply('Interesting, let me think about it.')).toMatchObject({ outcome: 'unclear' })
  })
})

describe('the provider their reply names', () => {
  test('named in their words, else none (the answer is then held)', () => {
    expect(providerNamed('We already use Humanitix for tickets.')).toBe('Humanitix')
    expect(providerNamed('we sell on trybooking')).toBe('TryBooking')
    expect(providerNamed('We have our own system.')).toBeNull()
    expect(providerNamed('Tickets are through dice')).toBe('DICE')
  })

  test('a platform the listing page does not name is none, so the answer is held', () => {
    expect(providerNamed('We sell through Megatix.')).toBeNull()
  })
})

describe('bounces and automatic replies are not replies', () => {
  test('a hard bounce', () => {
    expect(classifyInbound({ subject: 'Undeliverable: Your nights', fromAddress: 'postmaster@outlook.com', text: '550 5.1.1 The email account does not exist', headers: {} })).toEqual({ kind: 'bounce', hard: true })
  })
  test('a soft bounce', () => {
    expect(classifyInbound({ subject: 'Delivery Status Notification (Failure)', fromAddress: 'mailer-daemon@googlemail.com', text: '452 4.2.2 The recipient inbox is full', headers: {} })).toEqual({ kind: 'bounce', hard: false })
  })
  test('an out of office', () => {
    expect(reply('I am away until Monday.', 'Automatic reply: Your nights', { 'auto-submitted': 'auto-replied' })).toEqual({ kind: 'auto_reply' })
  })
  test("an acknowledgement with no auto header is closed by the engine, never put to Lawal (Bendigo Symphony Orchestra, 21 November 2026)", () => {
    // Production's own words, as the inbox reader logged them at 7.15 am.
    expect(reply('Thank you for contacting the Bendigo Symphony Orchestra. \r\n\r\nYour message has been forwarded to our Committee.', 'Re: Complimentary listing in our Bendigo events guide')).toEqual({ kind: 'auto_reply' })
    expect(reply('Thanks for your email. We have received your message and one of our team will be in touch shortly.')).toEqual({ kind: 'auto_reply' })
  })
  test("a person's answer that opens with thanks stays a reply", () => {
    expect(reply('Thank you for contacting us. Yes please, list our next night.')).toMatchObject({ kind: 'reply' })
    expect(reply('Thank you for contacting us. Your message has been forwarded to Sam: sam@venue.example')).toMatchObject({ kind: 'reply', outcome: 'referred' })
    expect(reply('Thanks for your email. We have received your message. How much does it cost?')).toMatchObject({ kind: 'reply', outcome: 'question' })
    expect(reply('Thank you for contacting us. Please stop emailing.')).toMatchObject({ kind: 'reply', outcome: 'stop' })
  })
})

/*
 * A REPLY ASKING WHAT WE MEAN IS A QUESTION (the PM's 20:50 item 4 of 24 November 2026): a reply to the Bendigo source ask
 * asked which of two things we meant and was classed 'referred' at 0.6, because its signature named a place. The fixtures
 * are paraphrases in the same shape, never the sender's own words.
 */
describe('a reply asking what we mean is a question, outranking referred', () => {
  const SIGNED = '\n\nKind regards,\nSam Example\nVisitor Information Officer\nExample Shire Visitor Centre\nvisitors@example-shire.vic.gov.au'
  test('which of two things we mean, with a signature naming a place and an address', () => {
    const r = reply(`Hi Lawal,\n\nAre you hoping we will send you a list of our events, or are you asking whether you can take the events on our calendar for your site?${SIGNED}`, 'Re: Example Region events on EventLinqs')
    expect(r).toMatchObject({ kind: 'reply', outcome: 'question', answerKey: null })
    // Never answered by itself: below CLEAR, it waits for Lawal with its class named.
    expect(r.kind === 'reply' && r.confidence < CLEAR).toBe(true)
  })
  test('what we want, said three ways', () => {
    expect(reply(`Thanks for your note. What exactly are you asking us for?${SIGNED}`)).toMatchObject({ kind: 'reply', outcome: 'question', answerKey: null })
    expect(reply(`Could you clarify what you need from our team?${SIGNED}`)).toMatchObject({ kind: 'reply', outcome: 'question', answerKey: null })
    expect(reply(`Hello, what is it that you're after here?${SIGNED}`)).toMatchObject({ kind: 'reply', outcome: 'question', answerKey: null })
  })
  test('a stop, a referral alone and a cost question keep their own class', () => {
    expect(reply(`Are you a business or a charity? Either way please stop emailing us.${SIGNED}`)).toMatchObject({ outcome: 'stop' })
    expect(reply(`Please contact Jordan in our events team.${SIGNED}`)).toMatchObject({ outcome: 'referred' })
    expect(reply('How much does it cost?')).toMatchObject({ outcome: 'question', answerKey: 'reply_cost' })
  })
})

describe('which published address the planner writes to first', () => {
  test('a named person, then events or bookings, then a general inbox, then the rest', () => {
    const order = ['steakhouse@mitretavern.com.au', 'info@mitretavern.com.au', 'events@mitretavern.com.au']
      .map((a) => [a, addressRank(a, null)] as const)
      .sort((x, y) => x[1] - y[1])
      .map(([a]) => a)
    expect(order).toEqual(['events@mitretavern.com.au', 'info@mitretavern.com.au', 'steakhouse@mitretavern.com.au'])
    expect(addressRank('accounts@venue.example', 'Pat')).toBe(0)
  })
})

describe('the true line holds only the listing facts', () => {
  test('a weekly night', () => {
    expect(trueLine('Open Mic Comedy', 'Here & Now Lounge', 'weekly', 0)).toBe('Open Mic Comedy at Here & Now Lounge, every Sunday.')
  })
  test('fortnightly and monthly', () => {
    expect(whenItRuns('fortnightly', 0)).toBe('every second Sunday')
    expect(whenItRuns('monthly-last', 5)).toBe('the last Friday of each month')
  })
  test('a one-off has no rhythm, so no true line: the draft is held', () => {
    expect(trueLine('Kate Ceberano', 'Costa Hall', 'once', 4)).toBeNull()
  })
  test('the nights', () => {
    expect(nightsOf('Open Mic Comedy')).toBe('Open Mic Comedy nights')
    expect(nightsOf('Trivia Night')).toBe('Trivia Nights')
  })
  test('a series before 5 pm is sessions, not nights', () => {
    expect(nightsOf('Baby Rhyme Time', '10:30:00')).toBe('Baby Rhyme Time sessions')
    expect(nightsOf('Saturday Live Music', '20:00:00')).toBe('Saturday Live Music nights')
  })
})

/*
 * A YES AFTER A GREETING, OR ON THE CONDITION OUR OFFER MEETS (the PM's 01:20 item 4 and 07:03 of 25 November 2026):
 * Stage 29 Studios' answer to our complimentary listing letter was read as unclear at 0.3 and waited four days for a tap.
 * Her words, exactly as the mailbox held them (21 November 2026, 9.02 am).
 */
const STAGE_29 =
  'Hi Lawal, if it’s free then yes this would be great thank you\r\n\r\nGet Outlook for iOS<https://aka.ms/o0ukef>\r\n________________________________\r\nFrom: Lawal Adams <lawal@eventlinqs.com>\r\nSent: Saturday, 21 November 2026 07:15:19\r\nTo: Jennifer Turner <info@stage29studios.com.au>\r\nSubject: Complimentary EventLinqs listing for Stage 29 Studios'

describe('a yes after a greeting, or on the condition that it is free, is a clear yes', () => {
  test("Stage 29 Studios' own words are a yes, clear, answered by the confirmation", () => {
    const k = reply(STAGE_29)
    expect(k).toMatchObject({ kind: 'reply', outcome: 'yes', answerKey: 'thank_you' })
    if (k.kind === 'reply') {
      expect(k.confidence).toBeGreaterThanOrEqual(CLEAR)
      expect(k.held).toBeUndefined()
    }
  })
  test.each([
    'Hi Lawal, yes please, that sounds great.',
    'Hello, sounds good to us.',
    'Dear Lawal,\nYes, go ahead.',
    "If it's complimentary then sure, happy to.",
    'If it is at no cost, yes please.',
  ])('%s is a clear yes', (text) => {
    const k = reply(text)
    expect(k).toMatchObject({ outcome: 'yes', answerKey: 'thank_you' })
    if (k.kind === 'reply') expect(k.confidence).toBeGreaterThanOrEqual(CLEAR)
  })
  test('a yes on any other condition, or a greeting with no yes, is not acted on', () => {
    for (const text of ['Hi Lawal, if the dates work then yes.', 'Hi Lawal, not this year thanks.', 'Hi Lawal, thanks for the email.']) {
      const k = reply(text)
      if (k.kind === 'reply') expect(k.outcome === 'yes' && k.confidence >= CLEAR).toBe(false)
    }
  })
})

describe('money or a contract is never answered by itself (CRM directive section 9)', () => {
  test.each([
    'Yes please, send through the contract and we will sign it.',
    'Happy to, what are your advertising rates?',
    'Sure, our fee for a feature is $150, please invoice us.',
    'Yes, we would love a sponsorship arrangement.',
  ])('%s is held for the PM, with no answer drafted', (text) => {
    const k = reply(text)
    expect(k).toMatchObject({ kind: 'reply', answerKey: null, held: HELD_MONEY_OR_CONTRACT })
    if (k.kind === 'reply') expect(k.confidence).toBeLessThan(CLEAR)
  })
  test('a stop that names money is still a stop, and a question about our cost is still answered', () => {
    expect(reply('Please stop emailing us, we will not pay for listings.')).toMatchObject({ outcome: 'stop', answerKey: 'reply_stop' })
    const cost = reply('How much does it cost?')
    expect(cost).toMatchObject({ answerKey: 'reply_cost' })
    if (cost.kind === 'reply') expect(cost.held).toBeUndefined()
  })
})
