import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine } from '@/lib/events/cta'
import { lockRefusal, planCampaign, type CampaignCity, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { isOlderLookDraft, olderLookRedraws, refusedOnceSwept } from '@/lib/social/store'
import { PIECE_RULES_SINCE } from '@/lib/social/piece-quality'

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

  it('never an approved, rejected or gone piece; a daily poster is drawn again by its own day (Lawal, 18 November 00:12)', () => {
    const { redraw, kept } = olderLookRedraws(
      [row({ id: 'b', kind: 'week_ahead', state: 'approved' }), row({ id: 'c', kind: 'week_ahead', state: 'rejected' }), row({ id: 'd', kind: 'week_ahead', state: 'gone' })],
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

  // 16 November 2026, read on production at 15:31: eleven pieces stood at version 7 after three hours. Each hour this sweep
  // drew them again with stand-in photographs, and the photo-rights sweep then blanked those photographs because production
  // had registered no stand-in yet (Lawal's item 26), so the cover led with none, the lock refused it, and the next hour drew
  // it again. A drawing is judged as the photo-rights sweep will leave it: if the lock would refuse that, it is not written.
  // Lawal's A and A (18 November 2026, 00:12): a drawing whose photographs the register removes is drawn in type and admitted.
  it('a drawing whose lead photograph the register would remove is admitted in type, as Lawal ruled', () => {
    const ahead = fresh.find((p) => p.kind === 'week_ahead')!
    const photoAt = ahead.slides.map((sl, i) => ('photo' in sl && sl.photo ? i : -1)).filter((i) => i >= 0)
    expect(photoAt[0]).toBe(0)
    const none = new Map(photoAt.map((i) => [i, null]))
    expect(refusedOnceSwept(ahead.slides, none)).toBeNull()
    const all = new Map(photoAt.map((i) => [i, { url: 'u', credit: 'c', assetId: 'a', focal: null, width: null, height: null }]))
    expect(refusedOnceSwept(ahead.slides, all)).toBeNull()
  })
})

describe("a stale piece of any kind is drawn again (Lawal's 00:12 of 18 November 2026)", () => {
  it('a daily poster drawn before the rules in force takes the fresh poster of its own day, never another day', () => {
    const base = fresh.find((p) => p.kind === 'week_ahead')!
    const posterOf = (day: string) => ({ ...base, kind: 'daily_poster' as const, posterDay: day })
    const stale = {
      ...row({ id: 'p', kind: 'daily_poster', slides: base.slides }),
      posterDay: '2026-11-19',
      history: [{ version: 1, madeBy: 'planner' as const, madeAt: '2026-11-15T19:40:07.237Z' }],
    }
    const { redraw } = olderLookRedraws([stale], [posterOf('2026-11-18'), posterOf('2026-11-19')])
    expect(redraw.map((r) => r.id)).toEqual(['p'])
    expect(redraw[0].plan.posterDay).toBe('2026-11-19')
    expect(olderLookRedraws([stale], [posterOf('2026-11-18')]).redraw).toEqual([])
  })
})

describe('the hourly redraw never loops (the sweep loop of 17 November, #291, never returns)', () => {
  it('a piece whose words a redraw cannot change (a source title) is never drawn again identical', () => {
    const base = fresh.find((p) => p.kind === 'week_ahead')!
    const same = {
      ...row({ id: 'q', kind: 'week_ahead', slides: base.slides }),
      revision: { slides: base.slides, version: 3, message: null, caption: `${base.caption}\nDarcy Gilkerson Quintet- JL Room`, madeAt: '2026-11-18T03:00:00.000Z', madeBy: 'sweep' as const },
    }
    const plan = { ...base, caption: same.revision.caption }
    const { redraw, kept } = olderLookRedraws([same], [plan])
    expect(redraw).toEqual([])
    expect(kept.join(' ')).toMatch(/would be the same/)
  })
})

describe('the hourly redraw reads what posts (the pack of 18 November 2026, 05:43)', () => {
  it("a piece whose fault is only in a platform's posted version is drawn again", () => {
    const base = fresh.find((p) => p.kind === 'week_ahead')!
    const posted = { ...base.versions, instagram: { ...base.versions.instagram, caption: 'Geelong Caravanning and Adventure Leisurefest, at Geelong Racecourse, Geelong.' } }
    const p = { ...row({ id: 'v', kind: 'week_ahead', slides: base.slides }), revision: { slides: base.slides, version: 4, message: null, caption: base.caption, versions: posted, madeAt: '2026-11-18T03:00:00.000Z', madeBy: 'sweep' as const } }
    expect(isOlderLookDraft(p)).toBe(true)
  })
  it('the rules moment is after #295 went live (05:02:54, 18 November 2026), so every drawing by older code is drawn again', () => {
    expect(Date.parse(PIECE_RULES_SINCE)).toBeGreaterThanOrEqual(Date.parse('2026-11-17T18:02:54Z'))
  })
})
