import { describe, expect, it } from 'vitest'
import { eventlinqsListingProblems, lineProblems } from '@/lib/events/eventlinqs-listing-words'

/**
 * WI1, Lawal's rulings 2 and 3 of 21 October 2026, at the save: on a walk-in
 * listing EventLinqs wrote from public information, no line we wrote says
 * "ticket" or "book" (but "No ticket needed") or carries a dollar sign. The
 * judge is only ever called for listing_source = 'eventlinqs'; an organiser's
 * own words are never judged (the rendered-page test proves they show as
 * written).
 */
describe('one line EventLinqs wrote', () => {
  it('passes plain copy', () => {
    expect(lineProblems('A free weekly trivia night upstairs. Teams of up to six.')).toEqual([])
  })

  it('allows the four phrases, and only those', () => {
    expect(lineProblems('Free entry, no ticket needed. Just come along.')).toEqual([])
    expect(lineProblems('No ticket needed')).toEqual([])
    expect(lineProblems('Free · No ticket needed')).toEqual([])
    expect(lineProblems('Free entry, no tickets required')).toEqual(['the word "ticket"'])
  })

  it('refuses a ticket word, a book word and a dollar sign, each by name', () => {
    expect(lineProblems('Tickets at the door')).toEqual(['the word "ticket"'])
    expect(lineProblems('An unticketed night')).toEqual([])
    expect(lineProblems('A ticketed night')).toEqual(['the word "ticket"'])
    expect(lineProblems('Bookings open through the venue')).toEqual(['a "book" word'])
    expect(lineProblems('Book a table')).toEqual(['a "book" word'])
    expect(lineProblems('Food from $10')).toEqual(['a dollar sign'])
    expect(lineProblems('Book now, $5 entry')).toEqual(['a "book" word', 'a dollar sign'])
  })

  it('does not read a word that merely starts with book', () => {
    expect(lineProblems('Held in the bookshop upstairs')).toEqual([])
  })
})

describe('a listing EventLinqs wrote', () => {
  it('a clean listing has no problem', () => {
    expect(
      eventlinqsListingProblems({
        summary: 'A free open mic every Tuesday.',
        description: 'Sign up on the night with the host.',
        guide: { days: [{ hours_label: '7pm, to confirm', items: [{ when: '7pm', what: 'Sign-ups open' }] }], highlights: [{ title: 'All welcome', body: 'Poets, comics and singers.' }] },
      }),
    ).toEqual([])
  })

  it('names the line that carries the problem, the way the form names it', () => {
    const problems = eventlinqsListingProblems({
      summary: 'A free open mic.',
      guide: { days: [{ items: [{ when: '7pm', what: 'Book your slot at the bar' }] }], getting_there: 'Parking from $5' },
    })
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^Day 1, program item 1 carries a "book" word\./)
    expect(problems[1]).toMatch(/^Getting there carries a dollar sign\./)
  })

  it('judges the summary and the description', () => {
    expect(eventlinqsListingProblems({ summary: 'Get tickets now' })[0]).toMatch(/^The one-line summary carries the word "ticket"/)
    expect(eventlinqsListingProblems({ description: 'Entry $10' })[0]).toMatch(/^The description carries a dollar sign/)
  })

  it('a line we write about a night of books is still refused, and is reworded rather than excused', () => {
    // The judge takes no title: "Silent Book Club" is a real free weekly night,
    // and its name is shown as it is. A line we WRITE about it is ours, though.
    expect(eventlinqsListingProblems({ summary: 'Bring a book and read in good company.' })).toEqual([
      expect.stringMatching(/a "book" word/),
    ])
    expect(eventlinqsListingProblems({ summary: 'Bring something to read and settle in with good company.' })).toEqual([])
  })
})
