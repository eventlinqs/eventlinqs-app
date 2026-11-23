import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  feedDateLine,
  intakeFaults,
  intakeOfRow,
  intakeRow,
  planIntakePiece,
  revisionCaptionRefusal,
  slidesOf,
  stateAfter,
  type IntakeInput,
  type IntakeRead,
  type IntakeRecord,
  type RegisterAsset,
} from '@/lib/creative/intake'
import { APPROVED_FILE_PREFIX, isApprovedFileUrl, pieceRefusal, type CampaignNight } from '@/lib/social/campaign'
import { goHop, PIECE_MARK } from '@/lib/social/go-hop'
import { law37Refusal } from '@/lib/social/law37'
import { relativeDateWords } from '@/lib/social/playbook'
import type { Timing } from '@/lib/social/timing'

/*
 * THE CREATIVE INTAKE'S GATES (Lawal, 23 November 2026, 13:15, the Creative Production Engine, sections E and F; the PM's
 * 12:18, items 2 and 3). Every gate a machine can judge, on a finished piece, at intake and again before publishing:
 * the facts read that minute (title, the one feed date line, the venue, the organiser the listing names, never a hired
 * venue), the rights each image rests on (an organiser's poster never altered), the timing engine's window, the booking
 * destination through the /go hop with one action, and the playbook's rules (no relative day, no long dash, the seller
 * named, the positioning words), with the caption rule the database enforces. A failure holds; nothing takes its place.
 */
const STORAGE = 'https://gndnldyfudbytbboxesk.supabase.co'
const ORIGIN = 'https://www.eventlinqs.com.au'
const NOW = new Date('2026-11-23T22:00:00.000Z') // Tuesday 24 November, 09:00 in Melbourne
const DESIGN = `${STORAGE}/storage/v1/object/public/event-images/creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/cover-1.jpg`
const POSTER = `${STORAGE}/storage/v1/object/public/event-images/org/sanity/poster.jpg`
const EVENT = '3f6f2d8e-5c1b-4a7e-9d2c-1b2a3c4d5e6f'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
})
afterEach(() => vi.unstubAllEnvs())

const night: CampaignNight = {
  eventId: EVENT,
  slug: 'a-moment-of-sanity',
  title: 'A Moment of Sanity',
  startDate: '2026-12-01T08:00:00.000Z', // Tuesday 1 December, 7pm in Melbourne
  endDate: '2026-12-01T10:00:00.000Z',
  timezone: 'Australia/Melbourne',
  citySlug: 'melbourne',
  cityName: 'Melbourne',
  venueName: 'Thornbury Apothecary',
  placeName: 'Thornbury Apothecary',
  venueId: 'a1b2c3d4-0000-4000-8000-000000000001',
  host: 'GroovyTown Wellbeing',
  organiser: 'GroovyTown Wellbeing',
  categorySlug: 'wellness',
  summary: 'An evening to breathe.',
  approvedPhotoUrl: null,
  photoCredit: null,
  cta: { state: 'paid_external', action: 'Get tickets', scan: 'Scan for tickets', ticketingByEventLinqs: false, freeEntry: false, registrationRequired: false, where: 'groovytown.com.au', chip: null },
  priceLine: null,
}

const IG = [
  '🧘 Two hours to breathe at Thornbury Apothecary.',
  'A Moment of Sanity, by GroovyTown Wellbeing',
  '📍 Thornbury Apothecary, 800 High Street, Thornbury',
  '📅 Tuesday 1 December, 7pm to 9pm',
  '🎟 Tickets are sold by groovytown.com.au; find them through the link in our bio',
].join('\n')
const FB = [
  '🧘 Two hours to breathe at Thornbury Apothecary.',
  'A Moment of Sanity, by GroovyTown Wellbeing',
  '📍 Thornbury Apothecary, 800 High Street, Thornbury',
  '📅 Tuesday 1 December, 7pm to 9pm',
  '🎟 Tickets are sold by groovytown.com.au:',
  goHop(ORIGIN, 'facebook'),
].join('\n')

const record = (over: Partial<IntakeInput> = {}): IntakeRecord => ({
  id: '7d0c1f7a-2b3c-4d5e-8f90-a1b2c3d4e5f6',
  state: 'received',
  pieceId: null,
  briefId: '9e8d7c6b-5a49-4382-a716-b5c4d3e2f1a0',
  eventIds: [EVENT],
  format: 'feed',
  images: [{ url: DESIGN, restsOn: { kind: 'asset', assetId: 'photo-1' } }],
  captions: { instagram: IG, facebook: FB },
  destinations: ['facebook', 'instagram'],
  facts: [{ eventId: EVENT, title: 'A Moment of Sanity', startDate: night.startDate, endDate: night.endDate ?? null, venue: 'Thornbury Apothecary', organiser: 'GroovyTown Wellbeing' }],
  link: `${ORIGIN}/events/a-moment-of-sanity`,
  objective: 'conversion',
  preferredAt: '2026-11-24T06:30:00.000Z',
  latestAt: '2026-11-30T12:00:00.000Z',
  expiresAt: '2026-12-01T06:00:00.000Z',
  ...over,
})

const photoAsset: RegisterAsset = { id: 'photo-1', assetUrl: `${STORAGE}/storage/v1/object/public/event-images/org/sanity/circle.jpg`, assetType: 'photo', eventId: EVENT, width: 1440, height: 1800, usableFor: new Set([EVENT]) }
const posterAsset: RegisterAsset = { id: 'poster-1', assetUrl: POSTER, assetType: 'artwork', eventId: EVENT, width: 1122, height: 1402, usableFor: new Set([EVENT]) }
const timing: Timing = { kind: 'window', objective: 'booking_reminder', preferredAt: null, latestAt: '2026-12-01T06:00:00.000Z', expiresAt: '2026-12-01T08:00:00.000Z', recovery: 'within_window', basis: 'test' }

const read = (over: Partial<IntakeRead> = {}): IntakeRead => ({
  nights: new Map([[EVENT, night]]),
  aliases: new Map(),
  known: new Map(),
  timing,
  assets: new Map([[photoAsset.id, photoAsset], [posterAsset.id, posterAsset]]),
  grants: new Map(),
  page: { ok: true, status: 200, body: '<a href="/events/a-moment-of-sanity">' },
  misfits: new Map([['facebook', null], ['instagram', null]]),
  ...over,
})

const faults = (r: IntakeRecord, rd: IntakeRead = read(), opts: { now?: Date; pieceId?: string | null } = {}) =>
  intakeFaults(r, rd, { stage: 'intake', now: opts.now ?? NOW, origin: ORIGIN, pieceId: opts.pieceId ?? null })

describe('the creative intake gates', () => {
  it('pass a finished piece whose facts, rights, timeline, destination and words all hold', () => {
    expect(faults(record())).toEqual([])
    expect(stateAfter([])).toBe('passed')
  })

  describe('facts, read that minute', () => {
    it("hold the date line that repeats its weekday, and say the one feed format ('Tuesday 24 November, 7pm to 9pm')", () => {
      const bad = IG.replace('📅 Tuesday 1 December, 7pm to 9pm', '📅 Tuesday, Tue 1 Dec, 7pm to 9pm')
      expect(feedDateLine(night)).toBe('📅 Tuesday 1 December, 7pm to 9pm')
      expect(faults(record({ captions: { instagram: bad, facebook: FB } })).join('\n')).toContain('"📅 Tuesday, Tue 1 Dec, 7pm to 9pm"; the record\'s is "📅 Tuesday 1 December, 7pm to 9pm"')
    })

    it('hold a credit naming the hired venue, never the organiser the listing names', () => {
      const bad = FB.replace('A Moment of Sanity, by GroovyTown Wellbeing', 'A Moment of Sanity, by Thornbury Apothecary')
      expect(faults(record({ captions: { instagram: IG, facebook: bad } })).join('\n')).toContain('credits Thornbury Apothecary, the venue,; the listing\'s organiser is GroovyTown Wellbeing')
    })

    it('hold a piece whose night has moved since it was made, or is no longer public and to come', () => {
      const moved = record({ facts: [{ ...record().facts[0], startDate: '2026-12-01T09:00:00.000Z' }] })
      expect(faults(moved).join('\n')).toContain('A Moment of Sanity: it now starts')
      expect(faults(record(), read({ nights: new Map() })).join('\n')).toContain('not read as a public night still to come')
    })

    it('hold a caption that never names the night or its venue', () => {
      const bare = '🧘 Two hours to breathe.\n🎟 Tickets are sold by GroovyTown; find them through the link in our bio'
      const said = faults(record({ captions: { instagram: bare, facebook: FB } })).join('\n')
      expect(said).toContain('The instagram caption does not name A Moment of Sanity.')
      expect(said).toContain("The instagram caption does not name A Moment of Sanity's venue, Thornbury Apothecary.")
    })
  })

  describe('rights, every image', () => {
    it("hold an organiser's poster that was altered, and pass it whole as its own file", () => {
      const altered = record({ images: [{ url: DESIGN, restsOn: { kind: 'organiser_artwork', assetId: 'poster-1' } }] })
      expect(faults(altered).join('\n')).toContain("an organiser's poster is never altered")
      const whole = record({ images: [{ url: POSTER, restsOn: { kind: 'organiser_artwork', assetId: 'poster-1' } }] })
      expect(faults(whole)).toEqual([])
    })

    it('hold an image whose permission is gone, a yes that does not cover the night, and a file outside /social/approved/', () => {
      const gone = read({ assets: new Map([[photoAsset.id, { ...photoAsset, usableFor: new Set<string>() }]]) })
      expect(faults(record(), gone).join('\n')).toContain('has no approved, current permission for A Moment of Sanity now')
      const yes = record({ images: [{ url: DESIGN, restsOn: { kind: 'grant', grantId: 'yes-1' } }] })
      expect(faults(yes).join('\n')).toContain('the yes yes-1, which is not on record or is withdrawn')
      expect(faults(yes, read({ grants: new Map([['yes-1', new Set([EVENT])]]) }))).toEqual([])
      const notApproved = record({ images: [{ url: `${ORIGIN}/social/other/cover.jpg`, restsOn: { kind: 'approved_file' } }] })
      expect(faults(notApproved).join('\n')).toContain('is not one under /social/approved/')
    })

    it('hold an image that is neither in our own storage nor its asset\'s own file', () => {
      const outside = record({ images: [{ url: 'https://example.com/cover.jpg', restsOn: { kind: 'asset', assetId: 'photo-1' } }] })
      expect(faults(outside).join('\n')).toContain('neither its asset\'s own file nor a finished design in our own storage')
    })
  })

  describe('the timing engine and the timeline', () => {
    it('expire a record past its expiry, and never pass it', () => {
      const said = faults(record(), read(), { now: new Date('2026-12-01T06:00:00.000Z') })
      expect(said.some((f) => /^\[timing\] EXPIRED: its expiry/.test(f))).toBe(true)
      expect(stateAfter(said)).toBe('expired')
    })

    it("hold a latest useful time after the timing engine's, and a piece past its latest", () => {
      expect(faults(record({ latestAt: '2026-12-01T07:00:00.000Z', expiresAt: '2026-12-01T07:30:00.000Z' })).join('\n')).toContain("is after the timing engine's for its nights")
      const late = faults(record(), read(), { now: new Date('2026-11-30T12:30:00.000Z') })
      expect(late.join('\n')).toContain('EXPIRED: its latest acceptable time')
    })

    it("carry the timing engine's own expiry for a night sold out or cancelled", () => {
      expect(faults(record(), read({ timing: { kind: 'expired', reason: 'A Moment of Sanity has sold out.' } })).join('\n')).toContain('EXPIRED: A Moment of Sanity has sold out.')
    })
  })

  describe('the booking destination through the /go hop, and one action', () => {
    it("hold a Facebook caption with a link other than its counted /go hop, and an Instagram caption with any link", () => {
      const fb = FB.replace(goHop(ORIGIN, 'facebook'), `${ORIGIN}/events/a-moment-of-sanity`)
      expect(faults(record({ captions: { instagram: IG, facebook: fb } })).join('\n')).toContain('it carries one, its counted /go hop')
      const ig = `${IG}\nhttps://groovytown.com.au/amomentofsanity`
      expect(faults(record({ captions: { instagram: ig, facebook: FB } })).join('\n')).toContain('Instagram takes none in a caption')
    })

    it('read the hop with the piece\'s own id once it is handed off', () => {
      const id = '11111111-2222-4333-8444-555555555555'
      const fb = FB.replace(PIECE_MARK, id)
      expect(faults(record({ captions: { instagram: IG, facebook: fb } }), read(), { pieceId: id })).toEqual([])
    })

    it('hold a destination page that does not list the night, or that does not answer', () => {
      const list = record({ link: `${ORIGIN}/city/melbourne` })
      expect(faults(list, read({ page: { ok: true, status: 200, body: '<p>nothing</p>' } })).join('\n')).toContain('/city/melbourne does not list A Moment of Sanity')
      expect(faults(record(), read({ page: { ok: false, status: 404, body: '' } })).join('\n')).toContain('answers 404')
    })

    it('hold an image that does not fit a destination', () => {
      const misfit = read({ misfits: new Map([['facebook', 'slide 1 does not fit facebook: too tall'], ['instagram', null]]) })
      expect(faults(record(), misfit).join('\n')).toContain('slide 1 does not fit facebook')
    })
  })

  describe("the playbook's rules and the caption rules", () => {
    it('hold a relative day in a feed caption (playbook no-relative-date)', () => {
      expect(relativeDateWords('See you tomorrow, or this weekend.')).toEqual(['tomorrow', 'this weekend'])
      const ig = IG.replace('Two hours to breathe', 'Two hours to breathe tonight')
      expect(faults(record({ captions: { instagram: ig, facebook: FB } })).join('\n')).toContain('says "tonight"; a feed post names its day and date')
    })

    it('hold a long dash, a second exclamation mark, the positioning words and a caption that does not name the seller', () => {
      const dash = FB.replace('breathe at', 'breathe — at')
      expect(faults(record({ captions: { instagram: IG, facebook: dash } })).join('\n')).toContain('long dash')
      const pos = FB.replace('🧘 Two hours', '🧘 The ticketing platform for two hours')
      expect(faults(record({ captions: { instagram: IG, facebook: pos } })).join('\n')).toContain('"ticketing platform"; EventLinqs is never called that')
      const unnamed = FB.replace('Tickets are sold by groovytown.com.au:', 'Tickets:')
      expect(faults(record({ captions: { instagram: IG, facebook: unnamed } })).join('\n')).toContain('Every night sells through groovytown.com.au; the facebook caption names it')
    })

    it('hold the Instagram caption the database would refuse as a revision (an exclamation mark)', () => {
      expect(revisionCaptionRefusal('Fine.')).toBeNull()
      expect(revisionCaptionRefusal('Go!')).toContain('exclamation mark')
      const ig = IG.replace('Two hours to breathe at Thornbury Apothecary.', 'Two hours to breathe at Thornbury Apothecary!')
      expect(faults(record({ captions: { instagram: ig, facebook: FB } })).join('\n')).toContain('the database refuses')
    })

    it('mirror the caption rule the database holds on social_piece_revisions exactly', () => {
      const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261028141001_social_campaigns.sql'), 'utf8')
      expect(sql).toContain("caption text not null check (length(btrim(caption)) between 1 and 2200 and caption !~ ('[' || chr(8211) || chr(8212) || '!]'))")
    })
  })
})

describe('the handoff into publishing', () => {
  it("draws a finished design as designed artwork and an organiser's poster whole as law 37's photograph", () => {
    const r = record({ images: [{ url: POSTER, restsOn: { kind: 'organiser_artwork', assetId: 'poster-1' } }, { url: DESIGN, restsOn: { kind: 'asset', assetId: 'photo-1' } }] })
    const planned = slidesOf(r, read().assets, read().nights)
    if (!('slides' in planned)) throw new Error(planned.refused)
    expect(planned.slides).toEqual([
      { t: 'photo', composition: 'photo_whole', eventId: EVENT, photo: POSTER, credit: null, width: 1122, height: 1402, line: null },
      { t: 'file', composition: 'close', url: DESIGN, format: 'feed', eventId: EVENT, startDate: night.startDate },
    ])
    expect(isApprovedFileUrl(DESIGN)).toBe(true)
    expect(law37Refusal(planned.slides)).toBeNull()
  })

  it('admits a creative design only in our own storage, under creative/<uuid>/, as .jpg', () => {
    for (const bad of [
      'https://elsewhere.supabase.co/storage/v1/object/public/event-images/creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/cover-1.jpg',
      `${STORAGE}/storage/v1/object/public/event-images/creative/not-a-uuid/cover-1.jpg`,
      `${STORAGE}/storage/v1/object/public/event-images/creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/cover-1.png`,
      `${STORAGE}/storage/v1/object/public/event-images/org/sanity/poster.jpg`,
    ]) {
      expect(isApprovedFileUrl(bad), bad).toBe(false)
    }
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(isApprovedFileUrl(DESIGN)).toBe(false)
    expect(isApprovedFileUrl(`${APPROVED_FILE_PREFIX}live-music-cover-2026-11-27.jpg`)).toBe(true)
  })

  it("plans a whole 'creative' piece in Car A's own shape, its words the record's, unapproved", () => {
    const r = record()
    const planned = slidesOf(r, read().assets, read().nights)
    if (!('slides' in planned)) throw new Error(planned.refused)
    const p = planIntakePiece(r, planned.slides, read().nights, ORIGIN)
    expect(p.kind).toBe('creative')
    expect(p.caption).toBe(IG)
    expect(p.versions.facebook.caption).toBe(FB)
    expect(p.versions.facebook.cta).toBe(goHop(ORIGIN, 'facebook'))
    expect(pieceRefusal(p)).toBeNull()
  })

  it('keeps the record as received: the row and back are the same record', () => {
    const r = record({ images: [{ url: DESIGN, restsOn: { kind: 'grant', grantId: 'yes-1' } }, { url: POSTER, restsOn: { kind: 'organiser_artwork', assetId: 'poster-1' } }] })
    const back = intakeOfRow({ ...intakeRow(r), id: r.id, state: r.state, piece_id: null })
    expect(back).toEqual(r)
  })
})
