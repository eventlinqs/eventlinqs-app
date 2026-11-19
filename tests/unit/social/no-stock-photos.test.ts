import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { creativeRefusals, planCampaign, type CampaignCity, type CampaignNight, type PiecePlan } from '@/lib/social/campaign'
import { pieceCorrections } from '@/lib/social/piece-quality'
import { namesAStandIn, NO_STAND_INS, STAND_INS_IN_PLAN, standInOf } from '@/lib/social/stand-ins'

/*
 * NEVER A STOCK PICTURE, NEVER ITS CREDIT LINE (the PM's 15:55 of 19 November 2026, items 3, 5 and 6, on Lawal's ruling of
 * 11:36 that day and law 7's photo rules A1 to A5). Every family goes out with the organiser's or venue's own permitted
 * photograph, or in the type only design. Three places hold it: the plan draws no stand-in (stand-ins.ts
 * STAND_INS_IN_PLAN, passed by store.ts planNow), a stored piece that carries one is drawn again by the hourly run
 * (piece-quality.ts pieceCorrections), and the publish gate holds any that is left (campaign.ts creativeRefusals). Each
 * check is drilled red on a piece the old plan drew with stand-ins.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-10-26'
const CITIES: CampaignCity[] = [{ slug: 'geelong', name: 'Geelong' }]

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { entryMode: 'walk_in', isFree: true })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `stock-night-${seq}`,
    title: `Stock Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'The Barwon Club',
    host: 'The Barwon Club',
    categorySlug: 'music',
    summary: 'A night of local bands in the front bar. Doors at seven.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

const week = [
  night({ at: '2026-10-27T09:00:00Z', title: 'The Barwon Club Live Bands', state: { tiers: [{ price: 2500 }] } }),
  night({ at: '2026-10-29T09:00:00Z', title: 'Sailors Rest Gig Night', host: 'Sailors Rest', venueName: "Sailors' Rest", state: { tiers: [{ price: 3000 }] } }),
  night({ at: '2026-10-30T09:00:00Z', title: 'Friday Rock Show', state: { tiers: [{ price: 2000 }] } }),
  night({ at: '2026-10-31T03:00:00Z', title: 'Geelong City Market', host: 'Geelong City Market', venueName: 'Little Malop Street', categorySlug: 'family' }),
  night({ at: '2026-11-01T07:00:00Z', title: 'Costa Hall Festival Night', host: 'Costa Hall', venueName: 'Costa Hall', categorySlug: 'festival', state: { tiers: [{ price: 4500 }] } }),
]
const nightsMap = new Map(week.map((n) => [n.eventId, { venueName: n.venueName, title: n.title }]))

const withStandIns = planCampaign({ nights: week, cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces
const asProduction = planCampaign({ nights: week, cities: CITIES, weekStart: WEEK, origin: ORIGIN, standIns: false }).pieces

const stockSlides = (p: Pick<PiecePlan, 'slides'>) => p.slides.filter((s) => 'photo' in s && standInOf(s.photo))
const captionsOf = (p: Pick<PiecePlan, 'caption' | 'versions'>) => [p.caption, ...Object.values(p.versions ?? {}).map((v) => v?.caption ?? '')]
const madeNow = new Date().toISOString()

describe('never a stock picture, never its credit line', () => {
  it('the switch is off in production, and off means a chooser that never picks', () => {
    expect(STAND_INS_IN_PLAN).toBe(false)
    expect(NO_STAND_INS('gig')).toBeNull()
  })

  it('the drill: the same week with stand-ins on draws them, so every check below can see one', () => {
    expect(withStandIns.some((p) => stockSlides(p).length > 0)).toBe(true)
    expect(withStandIns.some((p) => captionsOf(p).some(namesAStandIn))).toBe(true)
  })

  it('planned as production plans it, no slide carries a stock photograph and no caption names one', () => {
    expect(asProduction.length).toBeGreaterThan(0)
    for (const p of asProduction) {
      expect(stockSlides(p), `${p.kind} ${p.city}`).toEqual([])
      for (const c of captionsOf(p)) expect(namesAStandIn(c), `${p.kind} ${p.city}: ${c.slice(0, 80)}`).toBe(false)
    }
  })

  it('a stored piece drawn with a stand-in is drawn again by the hourly run; one drawn as production draws is not', () => {
    const old = withStandIns.find((p) => stockSlides(p).length > 0)!
    expect(pieceCorrections({ slides: old.slides, caption: old.caption, captions: captionsOf(old), madeAt: madeNow }).some((c) => c.startsWith('[photo] It is drawn with a stock photograph'))).toBe(true)
    const plain = asProduction.find((p) => p.kind === old.kind)!
    expect(pieceCorrections({ slides: plain.slides, caption: plain.caption, captions: captionsOf(plain), madeAt: madeNow }).some((c) => c.startsWith('[photo] It is drawn with a stock photograph'))).toBe(false)
  })

  it('a caption naming a stock photograph is drawn again, whatever its slides', () => {
    const plain = asProduction[0]
    const named = `${plain.caption}\nPictured on slide 1: a gig crowd, a photograph from Pexels, not this night.`
    expect(pieceCorrections({ slides: plain.slides, caption: named, captions: [named], madeAt: madeNow }).some((c) => c.startsWith('[photo]'))).toBe(true)
  })

  it('the publish gate holds a stock photograph and the caption naming it, and passes the piece production draws', () => {
    const old = withStandIns.find((p) => stockSlides(p).length > 0 && captionsOf(p).some(namesAStandIn))!
    const held = creativeRefusals(old, nightsMap)
    expect(held.some((h) => /carries a stock photograph/.test(h))).toBe(true)
    expect(held.some((h) => /name a stock photograph/.test(h))).toBe(true)
    const plain = asProduction.find((p) => p.kind === old.kind && p.city === old.city)!
    expect(creativeRefusals(plain, nightsMap).filter((h) => /stock photograph|emoji/.test(h))).toEqual([])
  })

  it("the publish gate holds a stock photograph's credit line on a slide whose photograph is gone", () => {
    const old = withStandIns.find((p) => stockSlides(p).length > 0)!
    const i = old.slides.findIndex((s) => 'photo' in s && standInOf(s.photo))
    const slides = old.slides.map((s, j) => (j === i ? ({ ...s, photo: null, credit: 'Photo: Jo Bloggs on Pexels' } as typeof s) : s))
    expect(creativeRefusals({ slides, versions: old.versions }, nightsMap)).toContain(`Slide ${i + 1} carries a stock photograph's credit line.`)
  })

  it('the publish gate holds a caption over five emoji, each caption judged alone', () => {
    const plain = asProduction[0]
    const six = '\u{1F389} Big night.\n\u{1F4CD} A\n\u{1F4C5} B\n\u{1F39F} C\n\u{1F3B6} D\n\u{1F517} E'
    const held = creativeRefusals({ slides: plain.slides, versions: { ...plain.versions, instagram: { ...plain.versions.instagram, caption: six } } }, nightsMap)
    expect(held).toContain('The Instagram words carry 6 emoji, over 5.')
    expect(held.some((h) => h.startsWith('The Facebook words carry'))).toBe(false)
  })
})
