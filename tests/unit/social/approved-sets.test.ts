import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { APPROVED_SETS, approvedSetNamed, approvedSetOfSlides, type ApprovedSet } from '@/lib/social/approved-sets'
import { APPROVED_FILE_PREFIX, isApprovedFileUrl, pieceRefusal, planApprovedSet, type PiecePlan } from '@/lib/social/campaign'
import { captionMarkFaults, exclamationCount } from '@/lib/social/caption-marks'
import { law37Refusal } from '@/lib/social/law37'
import { pieceCorrections, pieceQuality, type QualityNight } from '@/lib/social/piece-quality'
import { approveApprovedSet, drawApprovedSet, readCampaignNights } from '@/lib/social/store'
import { timingOf } from '@/lib/social/timing'
import { PLAYBOOK } from '@/lib/social/playbook'

/*
 * LAWAL'S APPROVED SETS (the founder, 23 November 2026, 14:34: "the smallest car that lets the engine publish designed
 * artwork ... and loads the approved files ... with the engine's own captions, windows and Facebook links ... Each marked
 * ready for the PM's review as soon as it is queued. Windows: comedy and music before Friday 27 November evening; Kyivska
 * before Saturday 5 December."). The nights below carry the times Lawal's approved files print (looked at full size,
 * 23 November 2026): Comedy Republic, 231 Bourke St; Melbourne Recital Centre, The JazzLab, Bird's Basement; The Wheeler
 * Centre, Saturday 5 December, 6.30 pm.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const NOW = new Date('2026-11-23T05:00:00.000Z') // 4 pm on Monday 23 November, Melbourne
const IMPROV = ['ecd0776e-e5c9-4a9e-9641-185c2cf750b3', 'b772a3ad-88a9-4a8f-bff5-aa3348b7a503', '152f235f-6a42-44bf-aeef-d03530f13af4']
const MAIN = ['11ac88ce-b5fd-4aa6-b2c6-78aa6bea3f89', 'dccd097f-be36-4ad0-bc53-09018758c117']
const SUNDAY = '7e2d2595-783f-4b5d-9485-6f829c954417'
const CHOIR = '922537f7-cda5-4a9f-b33d-591c4b3fe983'
const ROSS = ['d8c93296-4adf-4c7a-97d1-0db8f2191782', 'ed17c309-64e7-4107-a949-fbeae77872fa']
const JONES = 'd5fa4ea4-6f8b-4c88-93ef-e3ecfc651adc'
const NICOLLE = 'e0fd99c3-4607-48ab-987a-b2a3d4ccc5c3'
const KYIVSKA = 'a6778756-b6f0-4997-8f1a-8d6c2aaa0bbe'

type Row = Record<string, unknown>
const hour = 3_600_000
const VENUE_IDS: Record<string, string> = {
  'Comedy Republic': 'c0000000-0000-4000-8000-000000000001',
  'Melbourne Recital Centre': 'c0000000-0000-4000-8000-000000000002',
  'The JazzLab': 'c0000000-0000-4000-8000-000000000003',
  "Bird's Basement": 'c0000000-0000-4000-8000-000000000004',
  'The Wheeler Centre': 'c0000000-0000-4000-8000-000000000005',
}
const night = (id: string, slug: string, title: string, start: string, venue: string, category: string, price: number, minutes = 90): Row => ({
  id, slug, title, start_date: start, end_date: new Date(Date.parse(start) + minutes * 60_000).toISOString(), timezone: 'Australia/Melbourne',
  created_at: '2026-11-01T00:00:00.000Z', listing_series_id: null, status: 'published', visibility: 'public', venue_name: venue,
  venue_address: null, venue_city: 'Melbourne', venue_id: VENUE_IDS[venue] ?? null, is_age_restricted: false, age_restriction_min: null, cover_image_url: null,
  summary: null, is_free: false, entry_mode: 'ticketed', external_ticket_url: null, listing_source: null, category: { slug: category },
  organisation: { name: venue, slug: null }, ticket_tiers: [{ price, currency: 'AUD', is_active: true, total_capacity: 100, sold_count: 10, reserved_count: 0 }],
  event_booking_links: [], venue_row: { name: venue },
})
const EVENTS: Row[] = [
  night(IMPROV[0], 'holy-improv-fri-5pm', 'Holy Sh!t Improv', '2026-11-27T06:00:00.000Z', 'Comedy Republic', 'comedy', 29, 60),
  night(IMPROV[1], 'holy-improv-fri-630pm', 'Holy Sh!t Improv', '2026-11-27T07:30:00.000Z', 'Comedy Republic', 'comedy', 29, 60),
  night(IMPROV[2], 'holy-improv-sat-630pm', 'Holy Sh!t Improv', '2026-11-28T07:30:00.000Z', 'Comedy Republic', 'comedy', 29, 60),
  night(MAIN[0], 'main-stage-fri', 'Comedy Republic Main Stage', '2026-11-27T09:00:00.000Z', 'Comedy Republic', 'comedy', 34),
  night(MAIN[1], 'main-stage-sat', 'Comedy Republic Main Stage', '2026-11-28T09:00:00.000Z', 'Comedy Republic', 'comedy', 34),
  night(SUNDAY, 'sunday-laughternoons', 'Sunday Laughternoons', '2026-11-29T05:00:00.000Z', 'Comedy Republic', 'comedy', 29, 60),
  night(CHOIR, 'choir-3006', 'Choir 3006 In Concert', '2026-11-27T07:00:00.000Z', 'Melbourne Recital Centre', 'music', 45),
  night(ROSS[0], 'joel-ross-7pm', 'Joel Ross (NYC)', '2026-11-27T08:00:00.000Z', 'The JazzLab', 'music', 65),
  night(ROSS[1], 'joel-ross-930pm', 'Joel Ross (NYC)', '2026-11-27T10:30:00.000Z', 'The JazzLab', 'music', 65),
  night(JONES, 'jack-jones', 'Jack Jones: Hits & Stories', '2026-11-27T08:30:00.000Z', "Bird's Basement", 'music', 55),
  night(NICOLLE, 'michelle-nicolle', 'Michelle Nicolle & David McEvoy', '2026-11-27T09:30:00.000Z', 'Melbourne Recital Centre', 'music', 49),
  night(KYIVSKA, 'kyivska-perepichka', 'Kyivska Perepichka', '2026-12-05T07:30:00.000Z', 'The Wheeler Centre', 'theatre', 55, 120),
]
const CITIES: Row[] = [{ slug: 'melbourne', name: 'Melbourne', free_guide: true, is_active: true, display_order: 1 }]

/** A database as these reads and writes use it: every filter they send, the unique rules they meet, and every write kept. */
function fakeDb(seed: { events?: Row[]; tables?: Record<string, Row[]>; refuse?: { insert?: Record<string, string>; delete?: Record<string, string> } } = {}) {
  const tables: Record<string, Row[]> = { cities: CITIES, events: seed.events ?? EVENTS, ...(seed.tables ?? {}) }
  // A refusal the database answers, as production did (a check on an insert; a missing grant on a delete), by table.
  const refuse = { insert: { ...(seed.refuse?.insert ?? {}) }, delete: { ...(seed.refuse?.delete ?? {}) } }
  const writes: { table: string; op: string; rows: Row[] }[] = []
  let made = 0
  const subset = (have: unknown, want: unknown): boolean => {
    if (Array.isArray(want)) return Array.isArray(have) && want.every((w) => have.some((h) => subset(h, w)))
    if (want && typeof want === 'object') return !!have && typeof have === 'object' && Object.entries(want).every(([k, v]) => subset((have as Row)[k], v))
    return have === want
  }
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'insert' | 'upsert' | 'delete' = 'select'
    let payload: Row[] = []
    let one: 'single' | 'maybe' | null = null
    let lim = Infinity
    let order: { k: string; asc: boolean } | null = null
    const cmp = (k: string, f: (a: string, b: string) => boolean) => (v: unknown) => (filters.push((r) => r[k] != null && f(String(r[k]), String(v))), q)
    const run = () => {
      if (op === 'insert' && refuse.insert[table]) return { data: null, error: { code: '23514', message: refuse.insert[table] } }
      if (op === 'delete' && refuse.delete[table]) return { data: null, error: { code: '42501', message: refuse.delete[table] } }
      if (op === 'insert' || op === 'upsert') {
        const rows = payload.map((r): Row => ({ id: r.id ?? `00000000-0000-4000-8000-${String(++made).padStart(12, '0')}`, ...r }))
        const have = tables[table] ?? []
        if (table === 'social_campaigns') {
          const fresh = rows.filter((r) => !have.some((h) => h.week_start === r.week_start))
          tables[table] = [...have, ...fresh]
          writes.push({ table, op, rows: fresh })
          return { data: fresh, error: null }
        }
        if (table === 'social_pieces' && rows.some((r) => have.some((h) => h.campaign_id === r.campaign_id && h.kind === r.kind && h.city === r.city && (h.moment_key ?? '') === (r.moment_key ?? '')))) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "social_pieces_once"' } }
        }
        tables[table] = [...have, ...rows]
        writes.push({ table, op, rows })
        return { data: one ? rows[0] : rows, error: null }
      }
      const hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      if (op === 'delete') {
        tables[table] = (tables[table] ?? []).filter((r) => !hit.includes(r))
        writes.push({ table, op, rows: hit })
        return { data: null, error: null }
      }
      const by = order as { k: string; asc: boolean } | null
      let rows = by ? [...hit].sort((a, b) => (String(a[by.k]) < String(b[by.k]) ? -1 : 1) * (by.asc ? 1 : -1)) : hit
      rows = rows.slice(0, lim)
      if (one) return { data: rows[0] ?? null, error: one === 'single' && !rows[0] ? { message: 'no row' } : null }
      return { data: rows, error: null }
    }
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push((r) => String(r[k]) === String(v)), q),
      neq: (k: string, v: unknown) => (filters.push((r) => String(r[k]) !== String(v)), q),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.map(String).includes(String(r[k]))), q),
      gt: (k: string, v: unknown) => cmp(k, (a, b) => a > b)(v),
      gte: (k: string, v: unknown) => cmp(k, (a, b) => a >= b)(v),
      lt: (k: string, v: unknown) => cmp(k, (a, b) => a < b)(v),
      lte: (k: string, v: unknown) => cmp(k, (a, b) => a <= b)(v),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
      // The public rule's two listing groups pass every fixture night.
      or: () => q,
      contains: (k: string, v: unknown) => (filters.push((r) => subset(r[k], typeof v === 'string' ? JSON.parse(v) : v)), q),
      order: (k: string, o?: { ascending?: boolean }) => ((order = { k, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      range: () => q,
      maybeSingle: () => ((one = 'maybe'), q),
      single: () => ((one = 'single'), q),
      insert: (rows: Row | Row[]) => ((op = 'insert'), (payload = [rows].flat()), q),
      upsert: (rows: Row | Row[]) => ((op = 'upsert'), (payload = [rows].flat()), q),
      delete: () => ((op = 'delete'), q),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, bad),
    }
    return q
  }
  const db = {
    from,
    rpc: async (name: string) => {
      if (name === 'social_usable_images' || name === 'social_usable_images_all' || name === 'venue_distribution_off') return { data: [], error: null }
      throw new Error(`the fixture holds no function ${name}`)
    },
  }
  return { db: db as never, tables, writes, refuse }
}

const nightsOf = async (set: ApprovedSet, events: Row[] = EVENTS) =>
  readCampaignNights(fakeDb({ events }).db, [{ slug: 'melbourne', name: 'Melbourne' }], '2026-11-23', NOW, { ids: set.eventIds })
const planOf = async (name: string): Promise<PiecePlan> => {
  const set = approvedSetNamed(name) as ApprovedSet
  const planned = planApprovedSet(set, await nightsOf(set), ORIGIN)
  if ('refused' in planned) throw new Error(planned.refused)
  return planned.plan
}
const qualityNights = (ids: readonly string[]) =>
  new Map(
    EVENTS.filter((e) => ids.includes(e.id as string)).map((e) => [
      e.id as string,
      { eventId: e.id as string, title: String(e.title), summary: null, venueName: String(e.venue_name), host: null, categorySlug: 'comedy', startDate: String(e.start_date), timezone: 'Australia/Melbourne', endDate: String(e.end_date) } satisfies QualityNight,
    ]),
  )

describe("an exclamation mark, never a letter in an organiser's name (caption standard version 2, as one rule)", () => {
  it("a '!' written for a letter inside a word is the name's, never a mark the caption makes", () => {
    expect(exclamationCount('Fri 27 Nov, 5 pm: Holy Sh!t Improv')).toBe(0)
    expect(captionMarkFaults('\u{1F602} Three shows at Comedy Republic.\nFri 27 Nov, 5 pm: Holy Sh!t Improv\nFrom Holy Sh!t Improv on Friday.')).toEqual([])
  })

  it('every mark the caption makes still holds: outside the hook, two of them, and a name that ends in one', () => {
    expect(captionMarkFaults('\u{1F389} Big night.\nBe there!')).toEqual(['[caption] Its exclamation mark is outside the hook; one at most, in the hook only.'])
    expect(captionMarkFaults('\u{1F389} Big night! Be there!')).toEqual(['[caption] It carries 2 exclamation marks; one at most, in the hook.'])
    expect(captionMarkFaults('\u{1F3AD} A night out.\nSat 5 Dec: Oklahoma!')).toEqual(['[caption] Its exclamation mark is outside the hook; one at most, in the hook only.'])
    expect(captionMarkFaults('\u{1F3AD} Oklahoma! at the Regent.')).toEqual([])
    expect(captionMarkFaults('\u{1F3AD} Holy Sh!t Improv! Three shows.\nFri: Holy Sh!t Improv')).toEqual([])
  })
})

describe("each approved set names exactly its events and Lawal's files", () => {
  it('the three sets, their files in slide order and their nights', () => {
    expect(APPROVED_SETS.map((s) => s.name)).toEqual(['comedy-weekend', 'live-music', 'kyivska-perepichka'])
    expect(approvedSetNamed('comedy-weekend')).toMatchObject({ kind: 'weekend_carousel', files: ['comedy-weekend-cover-2026-11-27.jpg', 'comedy-weekend-shows-2026-11-27.jpg'], eventIds: [...IMPROV, ...MAIN, SUNDAY] })
    expect(approvedSetNamed('live-music')).toMatchObject({ kind: 'category_spotlight', files: ['live-music-cover-2026-11-27.jpg', 'live-music-choices-2026-11-27.jpg'], eventIds: [CHOIR, ...ROSS, JONES, NICOLLE] })
    expect(approvedSetNamed('kyivska-perepichka')).toMatchObject({ kind: 'coming_up', files: ['kyivska-perepichka-poster-2026-12-05.jpg', 'kyivska-perepichka-why-go-2026-12-05.jpg'], eventIds: [KYIVSKA] })
    // Holy Sh!t Improv & Friends is a different show, never in the comedy weekend.
    expect(approvedSetNamed('comedy-weekend')?.eventIds.some((id) => id.startsWith('c4381b2c'))).toBe(false)
    expect(new Set(APPROVED_SETS.map((s) => s.kind)).size).toBe(3)
    expect(approvedSetNamed('nothing')).toBeNull()
  })

  it('every file is on disk under public/social/approved/, a 1080 by 1350 JPEG at an approved address', async () => {
    for (const file of APPROVED_SETS.flatMap((s) => s.files)) {
      expect(isApprovedFileUrl(`${APPROVED_FILE_PREFIX}${file}`), file).toBe(true)
      const path = join(process.cwd(), 'public', 'social', 'approved', file)
      expect(existsSync(path), path).toBe(true)
      const meta = await sharp(path).metadata()
      expect({ file, format: meta.format, width: meta.width, height: meta.height }).toEqual({ file, format: 'jpeg', width: 1080, height: 1350 })
    }
  })
})

describe('an approved set, planned by the engine', () => {
  it("the slides are Lawal's files as they are, each carrying the set's first night, and law 37 as revised passes them", async () => {
    for (const set of APPROVED_SETS) {
      const p = await planOf(set.name)
      const first = EVENTS.filter((e) => set.eventIds.includes(e.id as string)).sort((a, b) => Date.parse(String(a.start_date)) - Date.parse(String(b.start_date)))[0]
      expect(p.slides).toEqual(set.files.map((f) => ({ t: 'file', composition: 'close', url: `${APPROVED_FILE_PREFIX}${f}`, format: 'feed', eventId: first.id, startDate: first.start_date })))
      expect(approvedSetOfSlides(p.slides)?.name).toBe(set.name)
      expect(law37Refusal(p.slides)).toBeNull()
      expect(pieceRefusal(p)).toBeNull()
      expect([...p.eventIds].sort()).toEqual([...set.eventIds].sort())
      expect(p).toMatchObject({ kind: set.kind, city: 'melbourne', format: 'feed', mode: 'graphic_led', momentKey: null, posterDay: null, partnerName: null })
    }
  })

  it("a set's one venue is read from the listing's own venue where the night has no venue row", async () => {
    const set = approvedSetNamed('comedy-weekend') as ApprovedSet
    const bare = EVENTS.map((e) => ({ ...e, venue_id: null, venue_row: null }))
    const planned = planApprovedSet(set, await nightsOf(set, bare), ORIGIN)
    if ('refused' in planned) throw new Error(planned.refused)
    expect(planned.plan.versions.instagram.caption.split('\n')[0]).toBe('\u{1F602} Three shows at Comedy Republic, Friday 27 to Sunday 29 November.')
  })

  it("the engine's own captions: Instagram's link in our bio, Facebook's counted /go hop, the page that lists every night", async () => {
    const comedy = await planOf('comedy-weekend')
    expect(comedy.versions.instagram.caption).toBe(
      [
        // No 'From ... to ...' line: the hook and the rows carry it (the PM's RETURN of 04:05 on 24 November 2026).
        '\u{1F602} Three shows at Comedy Republic, Friday 27 to Sunday 29 November.',
        'Fri 27 Nov, 5 pm and 6.30 pm and Sat 28 Nov, 6.30 pm: Holy Sh!t Improv',
        'Fri 27 Nov, 8 pm and Sat 28 Nov, 8 pm: Comedy Republic Main Stage',
        'Sun 29 Nov, 4 pm: Sunday Laughternoons',
        '\u{1F4CD} Comedy Republic, Melbourne',
        '\u{1F39F} Event details and tickets: link in our bio',
        'Tag who you are going with.',
        '#MelbourneEvents #ComedyRepublic #EventLinqs',
      ].join('\n'),
    )
    expect(comedy.versions.facebook.caption).toContain('\u{1F39F} Event details and tickets:\nhttps://www.eventlinqs.com.au/go/PIECE_ID_HERE?via=facebook\n')
    expect(comedy.versions.facebook.cta).toBe('https://www.eventlinqs.com.au/go/PIECE_ID_HERE?via=facebook')
    expect(comedy.link).toBe('https://www.eventlinqs.com.au/city/melbourne')

    const music = await planOf('live-music')
    expect(music.versions.instagram.caption).toBe(
      [
        // 'events', by the engine's own count noun (countNoun): these fixture nights' words name no one kind of performance.
        // Music of several kinds takes the music note; one day says its day once, on the date line, and its rows their times.
        '\u{1F3B6} Four events in Melbourne.',
        '\u{1F4C5} Friday 27 November',
        '6 pm: Choir 3006 In Concert, Melbourne Recital Centre',
        '7 pm and 9.30 pm: Joel Ross (NYC), The JazzLab',
        "7.30 pm: Jack Jones: Hits & Stories, Bird's Basement",
        '8.30 pm: Michelle Nicolle & David McEvoy, Melbourne Recital Centre',
        '\u{1F39F} Times and tickets for all four: link in our bio',
        'Tag who you are going with.',
        '#MelbourneEvents #Melbourne #EventLinqs',
      ].join('\n'),
    )
    expect(music.versions.facebook.caption).toContain('\u{1F39F} Times and tickets for all four:\nhttps://www.eventlinqs.com.au/go/PIECE_ID_HERE?via=facebook\n')
    expect(music.link).toBe('https://www.eventlinqs.com.au/city/melbourne')

    const kyivska = await planOf('kyivska-perepichka')
    expect(kyivska.versions.instagram.caption).toBe(
      [
        // One show: its title once in the hook, its date once on its own record's line.
        '\u{1F3AD} Kyivska Perepichka.',
        '\u{1F4C5} Saturday 5 December, 6:30pm to 8:30pm',
        '\u{1F4CD} The Wheeler Centre, Melbourne',
        '\u{1F39F} Event details and tickets: link in our bio',
        'Tag who you are going with.',
        '#MelbourneEvents #KyivskaPerepichka #EventLinqs',
      ].join('\n'),
    )
    expect(kyivska.versions.facebook.cta).toBe('https://www.eventlinqs.com.au/go/PIECE_ID_HERE?via=facebook')
    expect(kyivska.link).toBe('https://www.eventlinqs.com.au/events/kyivska-perepichka')
    for (const p of [comedy, music, kyivska]) {
      expect(p.versions.instagram.cta).toBe('link in our bio')
      expect(p.versions.instagram.caption).not.toMatch(/https?:\/\//)
      // No relative day word in a feed post (the PM's 13:32 of 23 November 2026).
      expect(`${p.versions.instagram.caption}\n${p.versions.facebook.caption}`).not.toMatch(/\b(today|tonight|tomorrow|this weekend|this week)\b/i)
    }
  })

  it("names the organiser's ticketing provider in the caption where every night sells through one, never on the artwork", async () => {
    const kyivska = approvedSetNamed('kyivska-perepichka') as ApprovedSet
    const sold = (provider: string) => ctaFor({ isFree: false, externalTicketUrl: `https://www.${provider.toLowerCase()}.com/au/event/1`, externalKind: 'tickets', providerName: provider })
    const planned = planApprovedSet(kyivska, (await nightsOf(kyivska)).map((n) => ({ ...n, cta: sold('TryBooking') })), ORIGIN)
    if ('refused' in planned) throw new Error(planned.refused)
    expect(planned.plan.versions.instagram.caption).toContain('\u{1F39F} Event details and tickets through TryBooking: link in our bio')
    expect(planned.plan.versions.facebook.caption).toContain('\u{1F39F} Event details and tickets through TryBooking:\nhttps://www.eventlinqs.com.au/go/PIECE_ID_HERE?via=facebook')
    // Sold in several places, each night's own page names its seller: the caption names none.
    const music = approvedSetNamed('live-music') as ApprovedSet
    const mixed = planApprovedSet(music, (await nightsOf(music)).map((n, i) => ({ ...n, cta: sold(i % 2 === 0 ? 'Moshtix' : 'Ticketek') })), ORIGIN)
    if ('refused' in mixed) throw new Error(mixed.refused)
    expect(mixed.plan.versions.instagram.caption).toContain('\u{1F39F} Times and tickets for all four: link in our bio')
  })

  it('the publish gate passes each before its first night, holds it once that night has started, and the code in force would not draw it again', async () => {
    for (const set of APPROVED_SETS) {
      const p = await planOf(set.name)
      const captions = [p.caption, p.versions.instagram.caption, p.versions.facebook.caption]
      expect(pieceCorrections({ slides: p.slides, caption: captions.join('\n'), captions, madeAt: NOW.toISOString() }), set.name).toEqual([])
      const nights = qualityNights(set.eventIds)
      expect(pieceQuality({ slides: p.slides, caption: captions.join('\n'), captions, madeAt: NOW.toISOString(), nights, now: NOW }), set.name).toEqual([])
      const firstStart = Math.min(...[...nights.values()].map((n) => Date.parse(n.startDate)))
      const started = pieceQuality({ slides: p.slides, caption: captions.join('\n'), captions, madeAt: NOW.toISOString(), nights, now: new Date(firstStart + 60_000) })
      expect(started.some((i) => i.startsWith('[night]') && i.includes('it has started')), set.name).toBe(true)
    }
  })

  it("the timing engine gives each the window the order names: comedy and music before Friday 27 November evening, Kyivska before its Saturday", async () => {
    const windowOf = async (name: string) => {
      const set = approvedSetNamed(name) as ApprovedSet
      const nights = EVENTS.filter((e) => set.eventIds.includes(e.id as string)).map((e) => ({ title: String(e.title), startDate: String(e.start_date), endDate: String(e.end_date), timezone: 'Australia/Melbourne', status: 'published', isFree: false, soldOut: false }))
      const t = timingOf({ moment: null, nights, preferredAt: new Date('2026-11-25T23:00:00.000Z'), multiDay: false }, NOW)
      if (t.kind !== 'window') throw new Error(t.kind)
      return t
    }
    // Friday 27 November, 5 pm in Melbourne is 06:00 UTC: both close by 3 pm, before the evening, for a weekend's planning.
    expect(await windowOf('comedy-weekend')).toMatchObject({ objective: 'weekend_planning', latestAt: '2026-11-26T13:00:00.000Z' })
    expect(Date.parse((await windowOf('live-music')).latestAt)).toBeLessThanOrEqual(Date.parse('2026-11-27T07:00:00.000Z'))
    expect(Date.parse((await windowOf('comedy-weekend')).latestAt)).toBeLessThanOrEqual(Date.parse('2026-11-27T07:00:00.000Z'))
    expect(Date.parse((await windowOf('kyivska-perepichka')).latestAt)).toBeLessThan(Date.parse('2026-12-05T07:30:00.000Z'))
  })
})

describe("the engine's intake: drawn unapproved for the PM's review, once", () => {
  it('writes one piece and its first revision, never an approval, a schedule or a posting', async () => {
    const { db, tables, writes } = fakeDb()
    const drawn = await drawApprovedSet(db, { set: 'comedy-weekend', now: NOW })
    expect(drawn.state).toBe('drawn')
    if (drawn.state !== 'drawn') return
    expect(drawn.already).toBe(false)
    expect(drawn.lines[0]).toContain("UNAPPROVED and unscheduled, ready for the PM's review")
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual(['upsert social_campaigns', 'insert social_pieces', 'insert social_piece_revisions'])
    expect(tables.social_piece_approvals ?? []).toEqual([])
    expect(tables.social_piece_schedules ?? []).toEqual([])
    const piece = (tables.social_pieces ?? [])[0]
    expect(piece).toMatchObject({ id: drawn.pieceId, kind: 'weekend_carousel', city: 'melbourne', format: 'feed', moment_key: null, link: 'https://www.eventlinqs.com.au/city/melbourne' })
    const rev = (tables.social_piece_revisions ?? [])[0] as { version: number; made_by: string; versions: PiecePlan['versions']; caption: string }
    expect(rev).toMatchObject({ piece_id: drawn.pieceId, version: 1, made_by: 'planner' })
    expect(rev.caption).toContain('link in our bio')
    // The counted /go hop carries the piece's own id, written by the one writer of a revision.
    expect(rev.versions.facebook.cta).toBe(`https://www.eventlinqs.com.au/go/${drawn.pieceId}?via=facebook`)
    expect(rev.versions.facebook.caption).toContain(`/go/${drawn.pieceId}?via=facebook`)

    const again = await drawApprovedSet(db, { set: 'comedy-weekend', now: new Date(NOW.getTime() + hour) })
    expect(again).toMatchObject({ state: 'drawn', pieceId: drawn.pieceId, already: true })
    expect(writes.length).toBe(3)
  })

  it('refuses a set any of whose nights has ended or is not public, saying which, and writes nothing', async () => {
    const ended = EVENTS.map((e) => (e.id === SUNDAY ? { ...e, end_date: '2026-11-23T04:00:00.000Z' } : e))
    const a = fakeDb({ events: ended })
    const refused = await drawApprovedSet(a.db, { set: 'comedy-weekend', now: NOW })
    expect(refused.state).toBe('refused')
    expect(refused.state === 'refused' && refused.reason).toMatch(new RegExp(`Sunday Laughternoons \\(${SUNDAY}\\): it has ended`))
    expect(a.writes).toEqual([])

    const draft = EVENTS.map((e) => (e.id === KYIVSKA ? { ...e, status: 'draft' } : e))
    const b = fakeDb({ events: draft })
    const held = await drawApprovedSet(b.db, { set: 'kyivska-perepichka', now: NOW })
    expect(held.state === 'refused' && held.reason).toMatch(/Kyivska Perepichka \(a6778756[^)]*\): it is not published and public \(draft, public\)/)
    expect(b.writes).toEqual([])

    const c = fakeDb()
    expect(await drawApprovedSet(c.db, { set: 'comedy', now: NOW })).toMatchObject({ state: 'refused', reason: expect.stringMatching(/No approved set is named 'comedy'/) })
  })
})

describe("stage approve: the PM's checked approval only", () => {
  const page = (slugs: readonly string[]) => async () => new Response(`<html><body>${slugs.map((s) => `<a href="/events/${s}">x</a>`).join('')}</body></html>`, { status: 200 })

  it("records one approval for a drawn set, through the publish gate, and never a schedule or a posting", async () => {
    const { db, tables, writes } = fakeDb()
    const drawn = await drawApprovedSet(db, { set: 'live-music', now: NOW })
    if (drawn.state !== 'drawn') throw new Error(drawn.reason)
    const slugs = EVENTS.filter((e) => approvedSetNamed('live-music')?.eventIds.includes(e.id as string)).map((e) => String(e.slug))
    const before = writes.length
    const approved = await approveApprovedSet(db, { pieceId: drawn.pieceId, by: 'f0000000-0000-4000-8000-000000000001', now: NOW, siteOrigin: ORIGIN, fetcher: page(slugs) })
    expect(approved).toEqual({ state: 'approved', pieceId: drawn.pieceId, set: 'live-music', reason: null })
    expect(writes.slice(before).map((w) => `${w.op} ${w.table}`)).toEqual(['insert social_piece_approvals'])
    expect(tables.social_piece_approvals?.[0]).toMatchObject({ piece_id: drawn.pieceId, revision: 1 })
    expect(tables.social_piece_schedules ?? []).toEqual([])
    expect(tables.social_piece_postings ?? []).toEqual([])
  })

  it('refuses a piece that is not an approved set, and the gate still refuses a set whose page does not list its nights', async () => {
    const { db, writes } = fakeDb({ tables: { social_piece_revisions: [{ piece_id: 'p-other', version: 1, event_ids: [], picks: [], mode: 'photo_led', slides: [{ t: 'photo' }], caption: 'x', versions: {}, message: null, made_by: 'planner', made_at: NOW.toISOString() }] } })
    expect(await approveApprovedSet(db, { pieceId: 'p-other', by: 'f0000000-0000-4000-8000-000000000001', now: NOW, siteOrigin: ORIGIN })).toMatchObject({ state: 'refused', reason: expect.stringMatching(/not an approved set's piece/) })
    const drawn = await drawApprovedSet(db, { set: 'kyivska-perepichka', now: NOW })
    if (drawn.state !== 'drawn') throw new Error(drawn.reason)
    const before = writes.length
    const refused = await approveApprovedSet(db, { pieceId: drawn.pieceId, by: 'f0000000-0000-4000-8000-000000000001', now: NOW, siteOrigin: ORIGIN, fetcher: page([]) })
    expect(refused.state).toBe('refused')
    expect(refused.reason).toMatch(/does not list it/)
    expect(writes.length).toBe(before)
  })
})

/*
 * A PIECE AND ITS FIRST REVISION ARE WRITTEN TOGETHER (the PM's intake of 23 and 24 November 2026): the comedy set's
 * piece 28e4096c was kept at 22:14 on 23 November while the caption check refused its words, the clean up's delete was
 * refused by a missing grant and never read, and the empty piece held the week's Melbourne weekend carousel place.
 */
describe('a piece and its first revision are written together', () => {
  const REFUSED_WORDS = 'new row for relation "social_piece_revisions" violates check constraint "social_piece_revisions_caption_check"'

  it('when the database refuses the first words, the empty piece is removed, and the next intake finds the place free', async () => {
    const { db, tables, writes, refuse } = fakeDb({ refuse: { insert: { social_piece_revisions: REFUSED_WORDS } } })
    const first = await drawApprovedSet(db, { set: 'comedy-weekend', now: NOW })
    expect(first.state).toBe('refused')
    expect(first.state === 'refused' && first.reason).toMatch(/its words were not kept .*social_piece_revisions_caption_check.*; its empty piece was removed, so the place is free/)
    expect(tables.social_pieces ?? []).toEqual([])
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual(['upsert social_campaigns', 'insert social_pieces', 'delete social_pieces'])
    // The rule the database refused by is put right (train seven's migration): the next intake draws, the place being free.
    delete refuse.insert.social_piece_revisions
    const second = await drawApprovedSet(db, { set: 'comedy-weekend', now: NOW })
    expect(second).toMatchObject({ state: 'drawn', already: false })
    expect((tables.social_pieces ?? []).length).toBe(1)
  })

  it('a removal the database refuses is said, never left silent', async () => {
    const { db, tables } = fakeDb({ refuse: { insert: { social_piece_revisions: REFUSED_WORDS }, delete: { social_pieces: 'permission denied for table social_pieces' } } })
    const out = await drawApprovedSet(db, { set: 'kyivska-perepichka', now: NOW })
    expect(out.state === 'refused' && out.reason).toMatch(/its empty piece \S+ could not be removed \(permission denied for table social_pieces\); it holds its place until a person removes it/)
    expect((tables.social_pieces ?? []).length).toBe(1)
  })

  it('every path that writes a piece writes it through the one writer, which removes the piece when its words are refused', () => {
    const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
    const store = src('src/lib/social/store.ts')
    const writer = store.slice(store.indexOf('export async function writePieceWithFirstRevision('), store.indexOf('\n}\n', store.indexOf('export async function writePieceWithFirstRevision(')))
    expect(writer).toContain(".from('social_pieces').insert(piece)")
    expect(writer).toContain(".from('social_pieces').delete().eq('id', pieceId)")
    expect(writer).toMatch(/const \{ error: derr \} = await db\.from\('social_pieces'\)\.delete\(\)/)
    // The one insert into social_pieces anywhere in src is the writer's own (the planner, its lifecycle moments, partner
    // kits and the owner's Post now draw through planCampaignWeek; the approved sets through drawApprovedSet).
    const inserts = [...store.matchAll(/from\('social_pieces'\)\s*\.insert\(/g)].length
    expect(inserts).toBe(1)
    for (const fn of ['export async function planCampaignWeek(', 'export async function drawApprovedSet(']) {
      const at = store.indexOf(fn)
      expect(store.slice(at, store.indexOf('\n}\n', at)), fn).toContain('await writePieceWithFirstRevision(')
    }
  })

  it('is a playbook rule, with its reason and its source', () => {
    expect(PLAYBOOK.find((r) => r.id === 'piece-and-first-revision-together')?.source).toBe("the PM's intake of 23 and 24 November 2026")
  })
})
/*
 * AN UNAPPROVED SET PIECE IS DRAWN AGAIN WITH TODAY'S RULES (the PM's intake of 23 and 24 November 2026): live music
 * 8d252108 and Kyivska 23f34b07 were drawn at 22:15 with the captions train seven fixed. Intake found each by its first
 * file and returned it, "drawn already".
 */
describe("an unapproved set piece is drawn again with today's rules", () => {
  const OLD = '\u{1F3B6} Kyivska Perepichka at The Wheeler Centre, Saturday 5 December.\nSat 5 Dec, 6.30 pm: Kyivska Perepichka'
  const drawnLastNight = (extra: Record<string, Row[]> = {}) => {
    const set = approvedSetNamed('kyivska-perepichka') as ApprovedSet
    const slides = set.files.map((f) => ({ t: 'file', composition: 'close', url: `${APPROVED_FILE_PREFIX}${f}`, format: 'feed', eventId: KYIVSKA, startDate: '2026-12-05T07:30:00.000Z' }))
    return fakeDb({
      tables: {
        social_pieces: [{ id: '0000c0de-0000-4000-8000-00000000c0de', campaign_id: 'c1', kind: 'coming_up', city: 'melbourne', moment_key: null, link: 'https://www.eventlinqs.com.au/events/kyivska-perepichka' }],
        social_piece_revisions: [{ piece_id: '0000c0de-0000-4000-8000-00000000c0de', version: 1, event_ids: [KYIVSKA], picks: [], mode: 'graphic_led', slides, caption: OLD, versions: { instagram: { caption: OLD }, facebook: { caption: OLD } }, message: null, made_by: 'planner', made_at: '2026-11-23T11:15:00.000Z' }],
        ...extra,
      },
    })
  }

  it('a drawn piece nobody approved takes a new revision with today\'s words, the piece id kept', async () => {
    const { db, tables, writes } = drawnLastNight()
    const out = await drawApprovedSet(db, { set: 'kyivska-perepichka', now: NOW })
    expect(out).toMatchObject({ state: 'drawn', pieceId: '0000c0de-0000-4000-8000-00000000c0de', already: true, redrawn: true })
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual(['insert social_piece_revisions'])
    const fresh = (tables.social_piece_revisions ?? []).find((r) => r.version === 2) as { made_by: string; caption: string; piece_id: string }
    expect(fresh).toMatchObject({ piece_id: '0000c0de-0000-4000-8000-00000000c0de', made_by: 'sweep' })
    expect(fresh.caption).not.toBe(OLD)
    expect(fresh.caption.split('\n')[0]).toBe('\u{1F3AD} Kyivska Perepichka.')
    expect(tables.social_pieces?.length).toBe(1)
    // Drawn again with nothing changed since, it is never written twice.
    const again = await drawApprovedSet(db, { set: 'kyivska-perepichka', now: NOW })
    expect(again).toMatchObject({ state: 'drawn', pieceId: '0000c0de-0000-4000-8000-00000000c0de', already: true })
    expect(writes.length).toBe(1)
  })

  for (const [table, words] of [['social_piece_approvals', 'approved'], ['social_piece_schedules', 'scheduled'], ['social_piece_postings', 'posted']] as const) {
    it(`a piece ${words} is returned untouched`, async () => {
      const { db, writes } = drawnLastNight({ [table]: [{ piece_id: '0000c0de-0000-4000-8000-00000000c0de' }] })
      const out = await drawApprovedSet(db, { set: 'kyivska-perepichka', now: NOW })
      expect(out).toMatchObject({ state: 'drawn', pieceId: '0000c0de-0000-4000-8000-00000000c0de', already: true })
      expect(out.state === 'drawn' && out.lines[0]).toContain(`it is ${words}; it is not drawn again`)
      expect(writes).toEqual([])
    })
  }

  it('is a playbook rule, with its reason and its source', () => {
    expect(PLAYBOOK.find((r) => r.id === 'unapproved-set-redrawn-with-todays-rules')?.source).toBe("the PM's intake of 23 and 24 November 2026")
  })
})
