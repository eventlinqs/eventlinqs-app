import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { intakeOfRow, intakeRow, rightsFaults, slidesOf, type IntakeInput, type IntakeRead, type RegisterAsset } from '@/lib/creative/intake'
import type { CampaignNight } from '@/lib/social/campaign'
import { law37Refusal } from '@/lib/social/law37'

/*
 * TWO MORE THINGS A FINISHED DESIGN MAY REST ON (WINDOW 5C, 25 November 2026; the PM's 01:02 item 3 and 01:12, the weekly
 * city carousel, SOCIAL-BENCHMARK-PLAYBOOK-25NOV.md section 5). The carousel is EventLinqs' own designed artwork (the
 * creative policy, Lawal's 23 November words verbatim in CREATIVE-POLICY-LAW37-REVISED-23NOV.md, point 3), rendered into
 * finished files in our own storage and handed to the creative intake, whose gates leave the PM an unapproved piece.
 *  - Its cover shows the city itself, on a photograph licensed for EventLinqs' own promotion and tied to no night: the
 *    register's own rule asks of such a photograph with no night (social_asset_usable_row: separately licensed, event_id
 *    null), so the gate asks it so, never as one of the carousel's nights, which it never shows.
 *  - A slide that shows no one else's photograph or artwork (a night drawn in type on the brand panel, the closing ask)
 *    rests on our own design alone; it is still only ever a finished design in our own storage.
 */
const STORAGE = 'https://gndnldyfudbytbboxesk.supabase.co'
const DESIGN = (name: string) => `${STORAGE}/storage/v1/object/public/event-images/creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/${name}.jpg`
const EVENT = '3f6f2d8e-5c1b-4a7e-9d2c-1b2a3c4d5e6f'
const CITY_URL = 'https://www.eventlinqs.com.au/social/cities/melbourne-city-circle-tram.jpg'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
})
afterEach(() => vi.unstubAllEnvs())

const night = { eventId: EVENT, title: 'A Moment of Sanity', startDate: '2026-12-01T08:00:00.000Z' } as CampaignNight

const record = (images: IntakeInput['images']): IntakeInput => ({
  briefId: '9e8d7c6b-5a49-4382-a716-b5c4d3e2f1a0',
  eventIds: [EVENT],
  format: 'feed',
  images,
  captions: { instagram: 'x', facebook: 'x' },
  destinations: ['instagram', 'facebook'],
  facts: [{ eventId: EVENT, title: night.title, startDate: night.startDate, endDate: null, venue: null, organiser: null }],
  link: 'https://www.eventlinqs.com.au/city/melbourne',
  objective: 'engagement',
  preferredAt: '2026-11-29T19:00:00.000Z',
  latestAt: '2026-11-30T13:00:00.000Z',
  expiresAt: '2026-11-30T13:00:00.000Z',
})

const city: RegisterAsset = { id: 'city-1', assetUrl: CITY_URL, assetType: 'photo', eventId: null, width: 1920, height: 1080, usableFor: new Set<string>(), usableAlone: true }
const read = (assets: RegisterAsset[]): Pick<IntakeRead, 'assets' | 'grants' | 'nights'> => ({
  assets: new Map(assets.map((a) => [a.id, a])),
  grants: new Map(),
  nights: new Map([[EVENT, night]]),
})

describe("a city's own photograph, under a finished design", () => {
  it('passes when the register holds it for our own promotion, tied to no night, and the design is in our own storage', () => {
    expect(rightsFaults(record([{ url: DESIGN('cover-1'), restsOn: { kind: 'city_photo', assetId: 'city-1' } }]), read([city]))).toEqual([])
  })

  it('is held when the register does not hold it as usable now with no night (withdrawn, unapproved, expired)', () => {
    const out = rightsFaults(record([{ url: DESIGN('cover-1'), restsOn: { kind: 'city_photo', assetId: 'city-1' } }]), read([{ ...city, usableAlone: false }])).join('\n')
    expect(out).toContain("is not approved and current for EventLinqs' own promotion now")
  })

  it("is held when the register's row is tied to a night, so it is no photograph of the city itself", () => {
    const out = rightsFaults(record([{ url: DESIGN('cover-1'), restsOn: { kind: 'city_photo', assetId: 'city-1' } }]), read([{ ...city, eventId: EVENT }])).join('\n')
    expect(out).toContain('is tied to a night')
  })

  it('is held when the register has no such row, and when the image is not a finished design in our own storage', () => {
    expect(rightsFaults(record([{ url: DESIGN('cover-1'), restsOn: { kind: 'city_photo', assetId: 'city-1' } }]), read([])).join('\n')).toContain('which is not in the register')
    expect(rightsFaults(record([{ url: 'https://example.com/cover.jpg', restsOn: { kind: 'city_photo', assetId: 'city-1' } }]), read([city])).join('\n')).toContain('not a finished design in our own storage')
  })

  it("never counts as permission for one of the record's nights: a night's own photograph is still asked as that night's", () => {
    // The same photograph named as an ordinary asset is asked for the night, and the register gives it none.
    const out = rightsFaults(record([{ url: DESIGN('cover-1'), restsOn: { kind: 'asset', assetId: 'city-1' } }]), read([city])).join('\n')
    expect(out).toContain('has no approved, current permission for A Moment of Sanity now')
  })
})

describe('our own design alone', () => {
  it('passes only as a finished design in our own storage', () => {
    expect(rightsFaults(record([{ url: DESIGN('ask-10'), restsOn: { kind: 'own_design' } }]), read([]))).toEqual([])
    const outside = rightsFaults(record([{ url: 'https://www.eventlinqs.com.au/social/other/ask.jpg', restsOn: { kind: 'own_design' } }]), read([])).join('\n')
    expect(outside).toContain('not a finished design in our own storage')
  })
})

describe('the carousel through the handoff', () => {
  it("becomes designed artwork slide by slide, every one law 37's format", () => {
    const r = record([
      { url: DESIGN('cover-1'), restsOn: { kind: 'city_photo', assetId: 'city-1' } },
      { url: DESIGN('night-2'), restsOn: { kind: 'own_design' } },
    ])
    const planned = slidesOf(r, new Map([[city.id, city]]), new Map([[EVENT, night]]))
    expect('slides' in planned).toBe(true)
    if (!('slides' in planned)) return
    expect(planned.slides.map((s) => s.t)).toEqual(['file', 'file'])
    expect(law37Refusal(planned.slides)).toBeNull()
  })

  it('keeps what each image rests on through the row and back', () => {
    const r = record([
      { url: DESIGN('cover-1'), restsOn: { kind: 'city_photo', assetId: 'city-1' } },
      { url: DESIGN('ask-2'), restsOn: { kind: 'own_design' } },
    ])
    const back = intakeOfRow({ ...intakeRow(r), id: '7d0c1f7a-2b3c-4d5e-8f90-a1b2c3d4e5f6', state: 'received', piece_id: null })
    expect(back.images.map((i) => i.restsOn)).toEqual([{ kind: 'city_photo', assetId: 'city-1' }, { kind: 'own_design' }])
  })
})
