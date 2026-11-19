import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { CAPTION_PHOTO_CREDITS, creativeRefusals, creditsOf, listCaptions, notAStreet, placeOf, planCampaign, type CampaignCity, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { pieceCorrections } from '@/lib/social/piece-quality'

/*
 * THE PM'S ROUND 3 VERDICTS OF 19 NOVEMBER 2026, AS CLASSES. Item 3: Bendigo's card named '1 Sailors Gully Road, Eaglehawk',
 * and its caption ran 'From Showtime on Saturday to Witness for the Prosecution on Saturday' when Witness opens on Friday.
 * Item 4: free week Melbourne's caption ended 'Photo: AMCF, past festival'. Each with its drill.
 */
let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { tiers: [{ price: 3000 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `r3-night-${seq}`,
    title: `R3 Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'bendigo',
    cityName: 'Bendigo',
    venueName: 'Ulumbarra Theatre',
    host: 'Ulumbarra Theatre',
    categorySlug: 'theatre',
    summary: 'A play in two acts.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $30' }),
    ...over,
  }
}

describe('a place is never a bare street address', () => {
  it.each([
    ['1 Sailors Gully Road, Eaglehawk', 'Eaglehawk'],
    ['12 Smith St, Fitzroy VIC 3065', 'Fitzroy'],
    ['99 Breakwater Rd, Breakwater VIC 3219', 'Breakwater'],
    ['4 Main Street', ''],
  ])('%s names %s', (street, suburb) => {
    expect(notAStreet(street)).toBe(suburb)
  })

  it.each(['Ulumbarra Theatre', "Her Majesty's Theatre Ballarat", '170 Russell', 'Costa Hall', 'The Story House'])('the drill: a venue name, %s, stands as it is', (name) => {
    expect(notAStreet(name)).toBe(name)
  })

  it('every card and line that names a place takes the suburb', () => {
    expect(placeOf({ venueName: '1 Sailors Gully Road, Eaglehawk' })).toBe('Eaglehawk')
    expect(placeOf({ venueName: '4 Main Street' })).toBeNull()
  })

  it('a stored card naming a street address is drawn again; a venue name is not', () => {
    const row = (place: string) => ({ t: 'days', composition: 'contents_cover', day: 'Fri', date: '20 Nov', rows: [{ eventId: 'e', startDate: '2026-11-20T08:00:00Z', when: '7:00 pm', sub: null, title: 'Witness', place, free: false }], photo: null, credit: null }) as unknown as Slide
    const now = new Date().toISOString()
    expect(pieceCorrections({ slides: [row('1 Sailors Gully Road, Eaglehawk')], caption: 'x', captions: ['\u{1F3AD} x'], madeAt: now }).some((c) => c.startsWith('[place]'))).toBe(true)
    expect(pieceCorrections({ slides: [row('Ulumbarra Theatre')], caption: 'x', captions: ['\u{1F3AD} x'], madeAt: now }).some((c) => c.startsWith('[place]'))).toBe(false)
  })
})

describe("a list caption's 'From ... to ...' line runs in time from each show's first session", () => {
  const witnessFri = night({ at: '2026-11-20T08:00:00Z', title: 'Witness for the Prosecution', venueName: 'Eaglehawk Town Hall' })
  const witnessSat = night({ at: '2026-11-21T08:00:00Z', title: 'Witness for the Prosecution', venueName: 'Eaglehawk Town Hall' })
  const showtime = night({ at: '2026-11-21T03:00:00Z', title: 'Showtime' })
  const base = { hook: '\u{1F389} Two shows in Bendigo this weekend.', rows: ['a', 'b'], pictured: null, place: null, link: 'https://www.eventlinqs.com.au/city/bendigo', share: 'Send this to them.', tags: '#BendigoEvents #EventLinqs', crop: '4:5' as const }

  it('names Witness, which opens on Friday, first', () => {
    const out = listCaptions({ ...base, nights: [witnessSat, showtime], sessionsOf: (n) => (n.title === 'Witness for the Prosecution' ? [witnessFri, witnessSat] : [n]) })
    expect(out.caption).toContain('From Witness for the Prosecution on Friday to Showtime on Saturday.')
  })

  it('the drill: without its sessions the line reads as production drew it', () => {
    const out = listCaptions({ ...base, nights: [witnessSat, showtime] })
    expect(out.caption).toContain('From Showtime on Saturday to Witness for the Prosecution on Saturday.')
  })
})

describe('no caption carries a photo credit line', () => {
  const CITIES: CampaignCity[] = [{ slug: 'bendigo', name: 'Bendigo' }]
  const withPhoto = [
    night({ at: '2026-10-27T09:00:00Z', approvedPhotoUrl: 'https://example.supabase.co/storage/v1/object/public/event-images/organisers/r3.jpg', photoCredit: 'AMCF, past festival' }),
    night({ at: '2026-10-29T09:00:00Z' }),
    night({ at: '2026-10-31T09:00:00Z' }),
  ]

  it('the switch is off, and the credit builder gives nothing', () => {
    expect(CAPTION_PHOTO_CREDITS).toBe(false)
    expect(creditsOf(withPhoto)).toBe('')
  })

  it('a week planned with an organiser photograph carries no credit line in any caption', () => {
    const { pieces } = planCampaign({ nights: withPhoto, cities: CITIES, weekStart: '2026-10-26', origin: 'https://www.eventlinqs.com.au', standIns: false })
    expect(pieces.length).toBeGreaterThan(0)
    for (const p of pieces) for (const c of [p.caption, p.versions.instagram.caption, p.versions.facebook.caption]) expect(c, `${p.kind}`).not.toMatch(/^\s*Photos?\s*:/m)
  })

  it('the publish gate holds one, and a stored one is drawn again', () => {
    const { pieces } = planCampaign({ nights: withPhoto, cities: CITIES, weekStart: '2026-10-26', origin: 'https://www.eventlinqs.com.au', standIns: false })
    const p = pieces[0]
    const credited = `${p.versions.instagram.caption}\nPhoto: AMCF, past festival`
    const held = creativeRefusals({ slides: p.slides, versions: { ...p.versions, instagram: { ...p.versions.instagram, caption: credited } } }, new Map())
    expect(held).toContain('The Instagram words carry a photo credit line; no caption carries one.')
    expect(pieceCorrections({ slides: p.slides, caption: credited, captions: [credited], madeAt: new Date().toISOString() })).toContain('[caption] It carries a photo credit line; drawn again without it.')
  })
})
