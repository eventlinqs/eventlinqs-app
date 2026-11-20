import { describe, expect, it } from 'vitest'
import { pieceDependencies } from '@/lib/social/store'
import { pastDaysPrinted } from '@/lib/social/piece-quality'

/*
 * The standing policy's first run over law 37 lifecycle pieces (06:40 on 21 November 2026) refused both of AMCF's
 * Saturday pieces with 'The check could not run (2)': a lifecycle piece's slide is a 'photo' slide, and the check fell
 * into the night and story branch, which reads slide.when (TypeError: Cannot read properties of undefined (reading
 * 'startsWith')). Production's own rows: AMCF (5d664060), 20 to 22 November, free entry, published and public; the feed
 * piece's one photo slide, AMCF's rank 1 photograph granted 'both'; its caption as the planner now draws it.
 */
const AMCF = '5d664060-a175-4b07-9c07-5e3c4a934c69'
const PHOTO = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/3b753251-8986-4ac4-8a0e-db2e5cbf9998/5d664060-a175-4b07-9c07-5e3c4a934c69/1792997332580-534762ba.jpg'
const TITLE = 'African Music and Cultural Festival 2026'
const night = (over: Record<string, unknown> = {}) => ({
  id: AMCF, slug: 'amcf-2026', title: TITLE, status: 'published', visibility: 'public',
  start_date: '2026-11-20T00:00:00Z', end_date: '2026-11-22T09:00:00Z', timezone: 'Australia/Melbourne', venue_id: null,
  venue_name: 'Federation Square', is_free: true, entry_mode: 'walk_in', ticket_tiers: [], event_booking_links: [], ...over,
})
const caption = (platform: 'instagram' | 'facebook') =>
  `Still on today.\n\n${TITLE}\n📍 Federation Square\n📅 Sat 21 to Sun 22 Nov\n💲 Free entry\n\n` +
  (platform === 'instagram' ? '🎟 Event details and tickets: link in our bio' : '🎟 Event details and tickets:\nhttps://www.eventlinqs.com.au/events/amcf-2026?utm_source=facebook')
const revision = {
  piece_id: 'p1', version: 2, event_ids: [AMCF], picks: [], mode: 'photo_led', message: null, made_by: 'planner', made_at: '2026-11-20T21:00:00.000Z',
  slides: [{ t: 'photo', composition: 'photo_whole', eventId: AMCF, photo: PHOTO, credit: null, width: 1100, height: 733, line: null }],
  caption: caption('instagram'),
  // As the planner writes them (lifecycle-plan.ts): each network's hook, caption, crop and call to action.
  versions: {
    instagram: { hook: 'Still on today.', caption: caption('instagram'), crop: '4:5', cta: 'Link in our bio.' },
    facebook: { hook: 'Still on today.', caption: caption('facebook'), crop: '4:5', cta: 'https://www.eventlinqs.com.au/events/amcf-2026?utm_source=facebook' },
  },
}

function fakeDb(opts: { event: Record<string, unknown>; usable: boolean }) {
  const rows: Record<string, Record<string, unknown>[]> = {
    social_pieces: [{ id: 'p1', kind: 'coming_up', link: 'https://www.eventlinqs.com.au/events/amcf-2026?utm_source=instagram', format: 'feed' }],
    social_piece_revisions: [revision],
    events: [opts.event],
    social_assets: [],
  }
  const query = (table: string) => {
    let list = [...(rows[table] ?? [])]
    let one = false
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => ((list = list.filter((r) => k === 'piece_id' || String(r[k]) === String(v))), q),
      neq: () => q,
      in: (k: string, vs: unknown[]) => ((list = list.filter((r) => vs.map(String).includes(String(r[k])))), q),
      order: () => q,
      limit: () => q,
      maybeSingle: () => ((one = true), q),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(ok(one ? { data: list[0] ?? null, error: null } : { data: list, error: null })),
    }
    return q
  }
  const usableRow = { event_id: AMCF, asset_id: 'bb4fd8a5-0000-0000-0000-000000000000', asset_url: PHOTO, scope: 'both', source_width: 1100, source_height: 733, attribution_text: null, lead_rank: 1 }
  return {
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      if (name === 'venue_distribution_off') return { data: [], error: null }
      if (name === 'social_asset_usable') return { data: opts.usable, error: null }
      if (name === 'social_usable_images') return { data: opts.usable ? [usableRow] : [], error: null }
      throw new Error(`the check called a function the fixture does not hold: ${name}`)
    },
  }
}
const NOW = new Date('2026-11-20T21:30:00.000Z') // 8.30 am on Saturday 21 November, Melbourne
// The event page answers with the night on it, as production's does.
const page = async () => new Response(`<html><body><h1>${TITLE}</h1><a href="/events/amcf-2026">${TITLE}</a></body></html>`, { status: 200 })
const run = (db: ReturnType<typeof fakeDb>) => pieceDependencies(db as never, 'p1', NOW, { siteOrigin: 'https://www.eventlinqs.com.au', fetcher: page })

describe("the standing policy's check over a law 37 lifecycle piece", () => {
  it('runs, and finds nothing against a running night on its middle day whose photograph is licensed for social', async () => {
    await expect(run(fakeDb({ event: night(), usable: true }))).resolves.toEqual([])
  })
  it('holds a piece whose night has ended, is no longer public, or whose photograph has no licence', async () => {
    expect(await run(fakeDb({ event: night({ end_date: '2026-11-20T20:00:00Z' }), usable: true }))).toEqual(expect.arrayContaining([expect.stringMatching(/has ended/)]))
    expect(await run(fakeDb({ event: night({ status: 'draft' }), usable: true }))).toEqual(expect.arrayContaining([expect.stringMatching(/no longer published and public/)]))
    expect(await run(fakeDb({ event: night(), usable: false }))).toEqual(expect.arrayContaining([expect.stringMatching(/no approved, unexpired licence/)]))
  })
  it("the run's label from its posting day passes the gate's past day rule; the first day's label on a later day does not", () => {
    expect(pastDaysPrinted(['📅 Sat 21 to Sun 22 Nov'], NOW)).toEqual([])
    expect(pastDaysPrinted(['📅 Fri 20 to Sun 22 Nov'], NOW)).not.toEqual([])
  })
})
