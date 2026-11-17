import { describe, expect, it } from 'vitest'
import { spotlightFits, spotlightLines, type CampaignNight } from '@/lib/social/campaign'

/*
 * A SPOTLIGHT HOLDS ONLY ITS KIND, AND READS NATURALLY (the PM's 23:45 of 17 November 2026, fix (b)): Melbourne's music
 * spotlight carried 'An Evening with Alastair Campbell', a talk, and its cover read '5 music / things in Melbourne / this
 * week'. A music spotlight takes music nights only; its words are '5 nights of / music in Melbourne / this week' when every
 * night is an evening, and '5 music / events in Melbourne / this week' otherwise.
 */
const n = (title: string, startDate: string, categorySlug = 'music', summary: string | null = null) =>
  ({ eventId: title, title, startDate, timezone: 'Australia/Melbourne', categorySlug, summary, venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' }) as unknown as CampaignNight

const talk = n('An Evening with Alastair Campbell', '2026-11-22T04:00:00Z')
const gig = n('The Teskey Brothers', '2026-11-18T09:00:00Z')
const holly = n('Holly Hebe', '2026-11-19T09:30:00Z')
const lunch = n('Lunchtime Jazz', '2026-11-20T02:00:00Z', 'music', 'A lunchtime jazz trio.')

describe('spotlightFits', () => {
  it('a talk filed as music is not in a music spotlight', () => {
    expect(spotlightFits('music', talk)).toBe(false)
  })
  it('a music night is', () => {
    expect(spotlightFits('music', gig)).toBe(true)
  })
})

describe('spotlightLines', () => {
  it("every night an evening: '5 nights of / music in Melbourne / this week'", () => {
    expect(spotlightLines('Music', [gig, holly, gig, holly, gig], 'Melbourne')).toEqual(['5 nights of', 'music in Melbourne', 'this week'])
  })
  it("a daytime night among them: '3 music / events in Melbourne / this week'", () => {
    expect(spotlightLines('Music', [gig, holly, lunch], 'Melbourne')).toEqual(['3 music', 'events in Melbourne', 'this week'])
  })
})
