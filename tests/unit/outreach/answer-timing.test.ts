import { describe, expect, test } from 'vitest'
import { ANSWER_FLOOR_MINUTES, answerAt, answerClassOf, answerMayLeave, inAnswerHours, type AnswerClass } from '@/lib/outreach/answer-timing'

/*
 * HOW FAST WE ANSWER (Lawal, 25 November 2026, 15:14 and 15:16; the PM's 15:14 and 15:17;
 * C:\dev\START-16OCT\COMMUNICATION-RESPONSE-TIMES-25NOV.md): by what the person wants, never under 50 minutes, inside
 * 07:00 to 21:00 in Melbourne every day, and from 07:30 in arrival order for what came overnight. Melbourne is on
 * daylight time (UTC+11) in late November.
 */
const at = (iso: string) => new Date(iso)
const mins = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60_000
// Thursday 26 November 2026, 10:00 in Melbourne.
const TEN = at('2026-11-25T23:00:00Z')

describe('the class of an answer, by what they want', () => {
  test('a yes to our acquisition letter is a sale; the same yes to a photo request is a reply to our letter', () => {
    expect(answerClassOf({ templateKey: 'thank_you', outcome: 'yes', answeredCategory: 'ACQ', words: 'Yes please' })).toBe('sale')
    expect(answerClassOf({ templateKey: 'thank_you', outcome: 'yes', answeredCategory: 'PERM', words: 'Yes, use them' })).toBe('letter')
  })
  test('their own words asking to list, claim or sell are a sale; selling elsewhere is not', () => {
    expect(answerClassOf({ templateKey: 'reply_cost', outcome: 'question', answeredCategory: 'PERM', words: 'How do I list my event?' })).toBe('sale')
    expect(answerClassOf({ templateKey: 'reply_cost', outcome: 'question', answeredCategory: 'ACQ', words: "We'd like to sell tickets with you" })).toBe('sale')
    expect(answerClassOf({ templateKey: 'reply_existing_ticketing', outcome: 'question', answeredCategory: 'ACQ', words: 'We already sell tickets through Eventbrite.' })).toBe('letter')
  })
  test('a partnership enquiry is general; a stop, a take down or a withdrawal confirmed is acted on when read', () => {
    expect(answerClassOf({ templateKey: 'reply_who_are_you', outcome: 'question', answeredCategory: 'ACQ', words: 'Open to a partnership?' })).toBe('general')
    expect(answerClassOf({ templateKey: 'reply_stop', outcome: 'stop', answeredCategory: 'ACQ', words: 'stop' })).toBe('act_now')
    expect(answerClassOf({ templateKey: 'withdrawal_confirmed', outcome: null, answeredCategory: null, words: '' })).toBe('act_now')
    expect(answerClassOf({ templateKey: null, outcome: 'take_down', answeredCategory: 'ACQ', words: 'remove it' })).toBe('act_now')
  })
})

describe('the time each class goes', () => {
  test('a sale 50 to 60 minutes after it arrived, a reply to our letter 60 to 105, general 210 to 225', () => {
    expect(mins(answerAt({ receivedAt: TEN, klass: 'sale', now: TEN, random: 0 }), TEN)).toBe(50)
    expect(mins(answerAt({ receivedAt: TEN, klass: 'sale', now: TEN, random: 1 }), TEN)).toBe(60)
    expect(mins(answerAt({ receivedAt: TEN, klass: 'letter', now: TEN, random: 0 }), TEN)).toBe(60)
    expect(mins(answerAt({ receivedAt: TEN, klass: 'letter', now: TEN, random: 1 }), TEN)).toBe(105)
    expect(mins(answerAt({ receivedAt: TEN, klass: 'general', now: TEN, random: 0 }), TEN)).toBe(210)
    expect(mins(answerAt({ receivedAt: TEN, klass: 'general', now: TEN, random: 1 }), TEN)).toBe(225)
  })

  test('never under 50 minutes, whatever the random part', () => {
    for (const klass of ['sale', 'letter', 'general'] as AnswerClass[]) {
      for (let i = 0; i <= 20; i++) {
        expect(mins(answerAt({ receivedAt: TEN, klass, now: TEN, random: i / 20 }), TEN)).toBeGreaterThanOrEqual(ANSWER_FLOOR_MINUTES)
      }
    }
  })

  test('a confirmation the law asks for goes when read; overnight, at 07:30', () => {
    expect(answerAt({ receivedAt: TEN, klass: 'act_now', now: TEN, random: 0.5 })).toEqual(TEN)
    // Read at 22:00 on Thursday: 07:31 on Friday (a minute for the hour since 21:00 it arrived).
    expect(answerAt({ receivedAt: at('2026-11-26T11:00:00Z'), klass: 'act_now', now: at('2026-11-26T11:00:00Z'), random: 0 }).toISOString()).toBe('2026-11-26T20:31:00.000Z')
  })

  test('what arrives after 21:00 is answered from 07:30, in the order it arrived, never before its floor', () => {
    // Wednesday 22:10 and 23:30 in Melbourne: 07:31 and 07:32 on Thursday.
    const a = answerAt({ receivedAt: at('2026-11-25T11:10:00Z'), klass: 'sale', now: at('2026-11-25T11:10:00Z'), random: 0 })
    const b = answerAt({ receivedAt: at('2026-11-25T12:30:00Z'), klass: 'sale', now: at('2026-11-25T12:30:00Z'), random: 0 })
    expect(a.toISOString()).toBe('2026-11-25T20:31:00.000Z')
    expect(b.toISOString()).toBe('2026-11-25T20:32:00.000Z')
    // 06:50 on Thursday: its floor, 07:40, is later than its place in the morning queue.
    expect(answerAt({ receivedAt: at('2026-11-25T19:50:00Z'), klass: 'sale', now: at('2026-11-25T19:50:00Z'), random: 0 }).toISOString()).toBe('2026-11-25T20:40:00.000Z')
  })

  test('a later class whose time falls after 21:00 goes at the close when its floor allows; else the next morning first', () => {
    // 20:00 general: 23:30 would be past the close; its floor, 20:50, is not: 21:00.
    expect(answerAt({ receivedAt: at('2026-11-26T09:00:00Z'), klass: 'general', now: at('2026-11-26T09:00:00Z'), random: 0 }).toISOString()).toBe('2026-11-26T10:00:00.000Z')
    // 20:30 reply to our letter: its floor, 21:20, is past the close: 07:30 on Friday, ahead of the overnight ones.
    expect(answerAt({ receivedAt: at('2026-11-26T09:30:00Z'), klass: 'letter', now: at('2026-11-26T09:30:00Z'), random: 0 }).toISOString()).toBe('2026-11-26T20:30:00.000Z')
  })

  test('an answer queued after its time goes now, inside the hours; queued at night, the next morning', () => {
    const three = at('2026-11-26T04:00:00Z') // 15:00
    expect(answerAt({ receivedAt: TEN, klass: 'letter', now: three, random: 0.3 })).toEqual(three)
    const night = at('2026-11-26T11:30:00Z') // 22:30
    expect(answerAt({ receivedAt: TEN, klass: 'letter', now: night, random: 0.3 }).toISOString()).toBe('2026-11-26T20:30:00.000Z')
  })

  test('across the end of daylight time (4 April 2027) the morning is still 07:30 in Melbourne', () => {
    // Saturday 3 April 2027, 23:30 daylight time; Sunday 07:30 standard time is 21:30Z, plus 2 minutes for its order.
    expect(answerAt({ receivedAt: at('2027-04-03T12:30:00Z'), klass: 'sale', now: at('2027-04-03T12:30:00Z'), random: 0 }).toISOString()).toBe('2027-04-03T21:32:00.000Z')
  })
})

describe('whether an answer may leave now', () => {
  test('not before it is 50 minutes old; a confirmation the law asks for has no floor', () => {
    expect(answerMayLeave({ receivedAt: TEN, templateKey: 'reply_cost', now: at('2026-11-25T23:30:00Z') })).toBe('too soon')
    expect(answerMayLeave({ receivedAt: TEN, templateKey: 'reply_cost', now: at('2026-11-25T23:50:00Z') })).toBe('now')
    expect(answerMayLeave({ receivedAt: TEN, templateKey: 'reply_stop', now: at('2026-11-25T23:05:00Z') })).toBe('now')
  })
  test('only from 07:00 to 21:00 in Melbourne, every day, 21:00 itself included', () => {
    expect(answerMayLeave({ receivedAt: TEN, templateKey: 'reply_cost', now: at('2026-11-26T10:30:00Z') })).toBe('outside hours')
    expect(inAnswerHours(at('2026-11-26T10:00:00Z'))).toBe(true)
    expect(inAnswerHours(at('2026-11-25T19:59:00Z'))).toBe(false)
    // Sunday 29 November, 19:00: no letter goes on a Sunday (law 44), but an answer does.
    expect(inAnswerHours(at('2026-11-29T08:00:00Z'))).toBe(true)
  })
})
