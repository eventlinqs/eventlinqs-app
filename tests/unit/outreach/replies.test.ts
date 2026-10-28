import { describe, expect, test } from 'vitest'
import { CLEAR, classifyInbound, providerNamed, stripQuoted } from '@/lib/outreach/replies'
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
