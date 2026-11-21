import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withVenuePhotos, type ChainDeps } from '@/lib/images/venue-photo-chain'
import { applyStandIns } from '@/lib/events/venue-thumbs'
import { cardPhoto } from '@/lib/events/card-facts'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import type { VenuePhoto } from '@/lib/venues/venue-photos-read'

/*
 * THE IMAGE LOCK (Lawal, 21 November 2026, 20:50 to 21:40, through the PM's 21:42). What he saw: the Festivals page put
 * ONE stand in on five different events, AMCF and Colours of Asia among them, which have their own permitted photographs,
 * because every surface chose a picture by category at render time and the category page never passed the rights. The
 * law: an event with its own permitted photograph shows that only; an event without one shows ITS OWN licensed stand in,
 * assigned once and never shared; else the brand panel. Never a picture by category, never one picture on two events.
 */
const OWN = 'https://x.supabase.co/storage/v1/object/public/event-images/u/e/own.jpg'

function deps(over: Partial<ChainDeps> = {}): ChainDeps {
  return {
    coversOf: async () => new Map(),
    clearedOf: async (ids) => new Set(ids.filter((id) => id === 'cleared')),
    standInsOf: async (ids) => new Map(ids.filter((id) => id.startsWith('stand') || id === 'uncleared').map((id) => [id, { imageUrl: `https://x/stand-ins/${id}.jpg`, alt: `the stand in of ${id}` }])),
    ...over,
  }
}

describe('no surface chooses a picture by category any more', () => {
  it('the category chooser is gone and nothing in src names it', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/images/illustrative.ts'))).toBe(false)
    const root = join(process.cwd(), 'src')
    const offenders = (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => {
        const s = readFileSync(join(root, f), 'utf8')
        return s.includes("from '@/lib/images/illustrative'") || /\billustrativePhoto\(/.test(s)
      })
    expect(offenders).toEqual([])
  })

  it('every card shape reads the night\'s own stand in from its record', () => {
    expect(readFileSync('src/components/features/events/event-card.tsx', 'utf8')).toContain('const stand = recorded ? null : (event.stand_in_url ?? null)')
    expect(readFileSync('src/lib/events/card-facts.ts', 'utf8')).toContain('if (r.standIn) return { src: r.standIn')
    expect(readFileSync('src/lib/images/event-media.ts', 'utf8')).toContain('if (event.stand_in_url) {')
    expect(readFileSync('src/lib/newsletter/edition.ts', 'utf8')).toContain('const stock = standIn')
  })
})

describe('the card chain carries each night\'s record', () => {
  it('a cleared own photograph is recorded; an uncleared one is not and takes its own stand in; a dealt venue photo is recorded', async () => {
    const venue: VenuePhoto = { imageUrl: 'https://x/venue.jpg', licence: 'cc0', credit: null, author: null, fileUrl: null, licenceUrl: null } as unknown as VenuePhoto
    const rows = await withVenuePhotos(
      [
        { id: 'cleared', cover_image_url: OWN },
        { id: 'uncleared', cover_image_url: OWN },
        { id: 'venue-night', cover_image_url: null },
        { id: 'stand-night', cover_image_url: null },
        { id: 'bare-night', cover_image_url: null },
      ],
      { deps: deps({ coversOf: async () => new Map([['venue-night', venue]]) }) },
    )
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by.cleared.cover_rights_recorded).toBe(true)
    expect(by.uncleared.cover_rights_recorded).toBe(false)
    expect(by.uncleared.stand_in_url).toBe('https://x/stand-ins/uncleared.jpg')
    expect(by['venue-night'].cover_image_url).toBe('https://x/venue.jpg')
    expect(by['venue-night'].cover_rights_recorded).toBe(true)
    expect(by['stand-night'].stand_in_url).toBe('https://x/stand-ins/stand-night.jpg')
    expect(by['stand-night'].stand_in_alt).toBe('the stand in of stand-night')
    expect(by['bare-night'].stand_in_url).toBeNull()
  })

  it('a failed read shows less, never a guess: no stand in, and no own photograph called cleared', async () => {
    const rows = await withVenuePhotos([{ id: 'cleared', cover_image_url: OWN }], {
      deps: deps({ clearedOf: async () => { throw new Error('down') }, standInsOf: async () => { throw new Error('down') } }),
    })
    expect(rows[0].cover_rights_recorded).toBe(false)
    expect(rows[0].stand_in_url).toBeNull()
  })

  it('no two nights on one page share a stand in, as the database assigns them (one photo, one night)', async () => {
    const ids = ['stand-a', 'stand-b', 'stand-c', 'stand-d']
    const rows = await withVenuePhotos(ids.map((id) => ({ id, cover_image_url: null })), { deps: deps() })
    const urls = rows.map((r) => r.stand_in_url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('the guide, home and weekend cards', () => {
  const row = (over: Partial<DirectoryRow>): DirectoryRow => ({ id: 'n1', title: 'A night', category: 'Festival', categorySlug: 'festival', thumb: null, venueThumb: null, ...over }) as unknown as DirectoryRow

  it("the night's own photograph, then its venue's, then its own stand in, else none", () => {
    expect(cardPhoto(row({ thumb: OWN, standIn: 'https://x/s.jpg' }))?.src).toBe(OWN)
    expect(cardPhoto(row({ venueThumb: 'https://x/venue.jpg', standIn: 'https://x/s.jpg' }))?.src).toBe('https://x/venue.jpg')
    expect(cardPhoto(row({ standIn: 'https://x/s.jpg', standInAlt: 'A festival crowd at dusk' }))).toEqual({ src: 'https://x/s.jpg', alt: 'A festival crowd at dusk', credit: null, illustrative: true })
    expect(cardPhoto(row({}))).toBeNull()
  })

  it('a stand in goes only to a night with neither its own photograph nor a venue photo', () => {
    const stands = new Map([['a', { imageUrl: 'https://x/a.jpg', alt: 'a' }], ['b', { imageUrl: 'https://x/b.jpg', alt: 'b' }], ['c', { imageUrl: 'https://x/c.jpg', alt: 'c' }]])
    const out = applyStandIns([row({ id: 'a', thumb: OWN }), row({ id: 'b', venueThumb: 'https://x/v.jpg' }), row({ id: 'c' })], stands)
    expect(out.map((r) => r.standIn ?? null)).toEqual([null, null, 'https://x/c.jpg'])
  })
})

describe('the database holds one photo to one night', () => {
  const sql = readFileSync('supabase/migrations/20261121180501_stand_in_photos.sql', 'utf8')
  it('a stand in is assigned through photo_assignments (unique by its hash), one live stand in per night, and pages read it only through the read function', () => {
    expect(sql).toContain('create unique index if not exists photo_assignments_one_stand_in_per_night on public.photo_assignments (event_id)')
    expect(sql).toContain('create unique index if not exists photo_assignments_one_stand_in_per_series on public.photo_assignments (listing_series_id)')
    expect(sql).toMatch(/insert into public\.photo_assignments \(photo_sha256, photo_dhash, image_url, event_id, listing_series_id, role, source, stand_in_photo_id\)/)
    expect(sql).toContain('revoke all on table public.stand_in_photos from anon, authenticated, service_role;')
    expect(sql).toContain('grant execute on function public.event_stand_ins_for(uuid[]) to anon, authenticated, service_role;')
    expect(sql).toContain('grant execute on function public.assign_stand_in(uuid, uuid) to service_role;')
    const assignments = readFileSync('supabase/migrations/20261031010001_photo_assignments.sql', 'utf8')
    expect(assignments).toContain('create unique index if not exists photo_assignments_one_event_per_photo on public.photo_assignments (photo_sha256);')
  })
})
