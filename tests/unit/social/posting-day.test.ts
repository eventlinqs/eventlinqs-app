import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { onItsDay } from '@/lib/social/daily-posters'
import type { Slide } from '@/lib/social/campaign'

/*
 * A POST ON ITS NIGHT'S OWN DAY SAYS SO (the PM's 06:39 of 18 November 2026, item 1): Fine Lines and Wine was to post on
 * Wednesday 18 November at 9 am for 6 pm that day and read 'Coming up in Geelong.'. A poster is drawn before its slot is
 * known, so the line is set at the moment it posts: 'Tonight', 'Today' or 'This afternoon' by the night's local start on
 * its own day; 'Coming up' only for a later day. Only that exact line changes.
 */
const slidesFor = (startDate: string, cityName = 'Geelong') =>
  [
    {
      t: 'poster',
      composition: 'daily_poster',
      eventId: 'e1',
      photo: null,
      credit: null,
      rights: 'type',
      night: { title: 'Fine Lines & Wine', startDate, endDate: null, timezone: 'Australia/Melbourne', cityName, venueName: 'Archive Wine Bar', venueAddress: null, cta: { state: 'paid_external' }, priceLine: null, isAgeRestricted: false, ageMin: null, shortLink: null },
    },
  ] as unknown as Slide[]
const caption = '✨ Fine Lines & Wine\nComing up in Geelong.\nA relaxed sketching night with a glass of wine at Archive Wine Bar.\n\n\u{1F4CD} Archive Wine Bar, Geelong'
// 6 pm, 10 am and 2 pm on Wednesday 18 November 2026 in Melbourne (UTC+11).
const evening = '2026-11-18T07:00:00Z'
const morning = '2026-11-17T23:00:00Z'
const afternoon = '2026-11-18T03:00:00Z'
const wed9am = new Date('2026-11-17T22:00:00Z')
const tue9pm = new Date('2026-11-17T10:00:00Z')

describe('a post on its night’s own day says so', () => {
  it('posted at 9 am on the day of a 6 pm night it reads Tonight', () => {
    expect(onItsDay(caption, slidesFor(evening), wed9am).split('\n')[1]).toBe('Tonight in Geelong.')
  })
  it('a morning night reads Today, an afternoon one This afternoon', () => {
    expect(onItsDay(caption, slidesFor(morning), new Date('2026-11-17T21:00:00Z')).split('\n')[1]).toBe('Today in Geelong.')
    expect(onItsDay(caption, slidesFor(afternoon), wed9am).split('\n')[1]).toBe('This afternoon in Geelong.')
  })
  it('posted on an earlier day it stays Coming up, and nothing else in the caption changes', () => {
    expect(onItsDay(caption, slidesFor(evening), tue9pm)).toBe(caption)
    const moved = onItsDay(caption, slidesFor(evening), wed9am).split('\n')
    expect([moved[0], ...moved.slice(2)]).toEqual([caption.split('\n')[0], ...caption.split('\n').slice(2)])
  })
  it('a title that holds the city reads the line without it', () => {
    expect(onItsDay('✨ Geelong Night Market\nComing up.\nStalls.', slidesFor(evening), wed9am).split('\n')[1]).toBe('Tonight.')
  })
  it('a piece with no poster slide is left as it is', () => {
    expect(onItsDay(caption, [], wed9am)).toBe(caption)
  })
  it('the publisher posts every caption through it, at the moment it posts', () => {
    const src = readFileSync('src/lib/social/store.ts', 'utf8')
    // The revision is proved there before the call (train AF: a piece with no revision or own format is held first), so the
    // call reads it plainly.
    // The approved words, their place given the night's own venue where it names none we hold (venue-identity.ts), then
    // the day's word set at the minute it posts.
    expect(src).toMatch(/const facts = await placeCorrectionFor\(db, rev\.eventIds, rev\.versions\[platform\]\.caption \?\? ''\)/)
    expect(src).toMatch(/caption: onItsDay\(facts\.caption, rev\.slides, now\)/)
  })
})
