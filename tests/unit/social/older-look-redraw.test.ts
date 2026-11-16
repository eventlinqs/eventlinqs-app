import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine } from '@/lib/events/cta'
import { lockRefusal, planCampaign, type CampaignCity, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { isOlderLookDraft, olderLookRedraws } from '@/lib/social/store'

/*
 * THE WEEK DRAWN AGAIN IN THE LOCKED LOOK (the PM's 09:35 of 16 November 2026): production's 29 pieces of that week were
 * planned at 06:40 by the code before #288, all in the older look (cover, night, end), which the checked approval
 * refuses, so the evening switch-on would have approved none. The hourly cron draws every older look draft again from the
 * week's plan; these cases drive the choice of what it draws and what it never touches.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-11-16'
const CITIES: CampaignCity[] = [{ slug: 'melbourne', name: 'Melbourne' }]
const PHOTO = 'https://example.supabase.co/storage/v1/object/public/event-images/organisers/approved.jpg'

let seq = 0
function night(at: string, host: string): CampaignNight {
  seq += 1
  const cta = ctaFor({ tiers: [{ price: 4500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `night-${seq}`,
    title: `Headline Night ${seq}`,
    startDate: at,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: host,
    host,
    categorySlug: 'music',
    summary: 'A band in the main room. Doors at seven.',
    approvedPhotoUrl: PHOTO,
    photoCredit: `Photo by ${host}`,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $45' }),
  }
}
const nights = [
  night('2026-11-17T08:30:00Z', 'Forum Melbourne'),
  night('2026-11-18T08:30:00Z', 'Corner Hotel'),
  night('2026-11-19T08:30:00Z', 'The Croxton'),
  night('2026-11-20T09:00:00Z', 'Northcote Social Club'),
  night('2026-11-21T09:00:00Z', 'Max Watts'),
]
const fresh = planCampaign({ nights, cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces
const OLDER = [{ t: 'cover' }, { t: 'night' }, { t: 'end' }] as unknown as Slide[]
const row = (over: { id: string; kind: string; state?: 'drafted' | 'approved' | 'rejected' | 'gone'; slides?: Slide[]; partnerName?: string | null }) => ({
  id: over.id,
  kind: over.kind as never,
  city: 'melbourne',
  partnerName: over.partnerName ?? null,
  state: over.state ?? 'drafted',
  revision: { slides: over.slides ?? OLDER, version: 1, message: null },
})

describe('the week drawn again in the locked look', () => {
  it('the older look is what the lock refuses', () => {
    expect(lockRefusal(OLDER)).toMatch(/older planner look/)
    expect(isOlderLookDraft(row({ id: 'a', kind: 'week_ahead' }))).toBe(true)
  })

  it("an older look draft takes the week's plan's own piece of its kind and city, at the next version", () => {
    const ahead = fresh.find((p) => p.kind === 'week_ahead')
    expect(ahead).toBeDefined()
    const { redraw, kept } = olderLookRedraws([row({ id: 'a', kind: 'week_ahead' })], fresh)
    expect(kept).toEqual([])
    expect(redraw).toHaveLength(1)
    expect(redraw[0]).toMatchObject({ id: 'a', version: 2, label: 'week_ahead melbourne' })
    expect(redraw[0].plan).toBe(ahead)
  })

  it('never an approved, rejected or gone piece, never a daily poster', () => {
    const { redraw, kept } = olderLookRedraws(
      [row({ id: 'b', kind: 'week_ahead', state: 'approved' }), row({ id: 'c', kind: 'week_ahead', state: 'rejected' }), row({ id: 'd', kind: 'week_ahead', state: 'gone' }), row({ id: 'e', kind: 'daily_poster' })],
      fresh,
    )
    expect(redraw).toEqual([])
    expect(kept).toEqual([])
  })

  it("a draft the week's plan no longer draws stays as it is, said", () => {
    const { redraw, kept } = olderLookRedraws([row({ id: 'f', kind: 'partner_kit', partnerName: 'A Partner' })], fresh)
    expect(redraw).toEqual([])
    expect(kept).toEqual(["partner_kit melbourne A Partner: this week's plan no longer draws it in the locked look, so it stays as it is"])
  })

  it('a draft already in the locked look is never drawn again', () => {
    const ahead = fresh.find((p) => p.kind === 'week_ahead')!
    expect(lockRefusal(ahead.slides)).toBeNull()
    const { redraw } = olderLookRedraws([row({ id: 'g', kind: 'week_ahead', slides: ahead.slides })], fresh)
    expect(redraw).toEqual([])
  })
})
