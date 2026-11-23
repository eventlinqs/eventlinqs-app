import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { contactDecision } from '@/lib/outreach/contact-policy'

/*
 * LAW 49'S PERMISSION REQUEST IS JUDGED NIGHT BY NIGHT (Lawal, 21 November 2026, 09:20: "EVERY EVENT HAS A CLOCK ... T-28
 * to T-21: PERM: one photo permission request", C:\dev\START-16OCT\EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md section 2; his
 * master directive of 24 November 2026, 01:09, A1: "The unit of image-permission assessment is the event and asset. The
 * unit of outbound communication is the organiser ... A previous email to an organiser does not automatically establish
 * permission for every event they organise"; Part D, Tests 1 and 2; the PM's 01:10: no new eligibility rule, letter or
 * process).
 *
 * THE DEPARTURE (the coordinator's reconciliation of 01:13 on 24 November 2026, read from production): the reader
 * (src/lib/outreach/lifecycle-read.ts) counted ANY PERM-IMAGE letter going or sent to ANY of the organiser's contacts as
 * "already asked: ... one goes per organiser", for every night of theirs, for ever. So once the contact policy's 30 day
 * gap ended, none of their later nights would ever be asked. These drive the real reader with the database stood in.
 * When a letter may go stays the contact policy's (30 days, replies, unsubscribes), unchanged; whether a night needs
 * asking is the night's own.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
// Saturday 14 November 2026, 07:00 in Melbourne, inside law 44's window.
const NOW = new Date('2026-11-13T20:00:00Z')
const DAY = 86_400_000
type Night = { eventId: string; slug: string; title: string; startDate: string; timezone: string; venueName: string; isFree: boolean }
const night = (id: string, startDate: string): Night => ({ eventId: id, slug: `${id}-2026`, title: `Night ${id}`, startDate, timezone: 'Australia/Melbourne', venueName: 'The Hall', isFree: false })
// Three nights of one organiser, soonest first, each between T-28 and T-21 (the request is due on each by its own clock).
const NIGHT_A = night('e-a', '2026-12-09T09:00:00Z') // Wednesday 9 December, T-25
const NIGHT_B = night('e-b', '2026-12-10T09:00:00Z') // Thursday 10 December, T-26
const NIGHT_C = night('e-c', '2026-12-11T09:00:00Z') // Friday 11 December, T-27
let NIGHTS: Night[] = []

vi.mock('@/lib/growth/platform-organiser', () => ({ readPlatformOrganiserIds: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => NIGHTS) }))
const { readLifecycleFacts } = await import('@/lib/outreach/lifecycle-read')

type Touch = { contact_id: string; state: string; play_id: string | null; comms_subtype: string; sent_at: string | null; scheduled_for?: string | null; drafted_at?: string | null; context_key: string | null }
type World = {
  nights: Night[]
  touches?: Touch[]
  /** When each night went public on EventLinqs (events.published_at), by id. */
  listed?: Record<string, string>
  /** Nights whose cover is the organiser's own photograph with recorded rights. */
  approved?: string[]
}

const CONTACT = {
  id: '3f2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f', channel: 'email', address: 'info@thehall.org.au', person_name: null,
  unsubscribe_token: '7c9e6679-7425-40de-944b-e07fc1f90ae7', basis: 'conspicuous_publication', published_on_url: 'https://www.thehall.org.au/contact', no_marketing_statement_checked: true,
}
const cover = (id: string) => `https://example.supabase.co/storage/v1/object/public/event-images/stand-in/${id}.avif`

function fakeDb(world: World) {
  NIGHTS = world.nights
  const answer = (table: string, columns: string) => {
    if (table === 'organiser_contacts' && columns === 'organiser_id') return { data: { organiser_id: 'o-hall' }, error: null }
    if (table === 'organiser_contacts') return { data: [CONTACT], error: null }
    if (table === 'outreach_touches') return { data: world.touches ?? [], error: null }
    if (table === 'outreach_replies') return { data: [], error: null }
    if (table === 'organisers') return { data: { id: 'o-hall', name: 'The Hall', organisation_id: null, website_url: 'https://www.thehall.org.au' }, error: null }
    if (table === 'events') {
      return {
        data: world.nights.map((n) => ({
          id: n.eventId, end_date: null, city_primary: 'geelong', external_ticket_url: `https://events.humanitix.com/${n.eventId}`, cover_image_url: cover(n.eventId),
          created_at: world.listed?.[n.eventId] ?? '2026-10-01T00:00:00Z', published_at: world.listed?.[n.eventId] ?? '2026-10-01T00:00:00Z',
        })),
        error: null,
      }
    }
    if (table === 'event_image_rights') return { data: (world.approved ?? []).map((id) => ({ event_id: id, image_url: cover(id), rights_state: 'organiser_authorised' })), error: null }
    if (table === 'event_booking_links') return { data: [], error: null }
    if (table === 'social_assets') return { data: [], error: null }
    return { data: null, error: { message: `unexpected read of ${table}` } }
  }
  const db = {
    from: (table: string) => ({
      select: (columns: string) => {
        const b: Record<string, unknown> = {}
        for (const op of ['eq', 'in', 'neq']) b[op] = () => b
        b.limit = () => b
        b.order = () => b
        b.single = async () => answer(table, columns)
        b.maybeSingle = async () => answer(table, columns)
        b.then = (resolve: (v: unknown) => unknown) => resolve(answer(table, columns))
        return b
      },
    }),
  }
  return db as unknown as SupabaseClient<Database>
}
const readPerm = (db: SupabaseClient<Database>) => readLifecycleFacts(db, { key: 'lifecycle_perm', playId: 'play-perm', contactId: CONTACT.id, now: NOW, origin: ORIGIN })
const sentAbout = (eventId: string | null, at: string): Touch => ({ contact_id: CONTACT.id, state: 'sent', play_id: 'play-old', comms_subtype: 'PERM-IMAGE', sent_at: at, context_key: eventId ? `event:${eventId}` : null })

describe('Test 1: a night with no approved image, whose organiser was asked about a different night, is due', () => {
  it('asked about night B weeks ago: night A, never asked, is due by its own clock', async () => {
    const read = await readPerm(fakeDb({ nights: [NIGHT_A, NIGHT_B], touches: [sentAbout('e-b', '2026-10-10T20:00:00Z')] }))
    expect(read).toMatchObject({ state: 'read', eventId: 'e-a' })
  })

  it('and the contact policy alone decides when: 35 days after that letter the gap allows it, 5 days after it holds it', () => {
    const history = (sentAt: string) => ({
      organiserId: 'o-hall', contacts: [{ id: CONTACT.id, address: CONTACT.address, basis: CONTACT.basis }],
      touches: [{ id: 't-b', contactId: CONTACT.id, purpose: 'cadence', step: 1, category: 'PERM', state: 'sent', sentAt, scheduledFor: sentAt }],
      replies: [], suppressed: [], bounced: [], claimed: false,
    })
    const candidate = { contactId: CONTACT.id, purpose: 'cadence', step: 1, templateKey: 'lifecycle_perm', moment: 'draft' as const }
    expect(contactDecision(candidate, history(new Date(NOW.getTime() - 35 * DAY).toISOString()), NOW)).toEqual({ state: 'allowed' })
    expect(contactDecision(candidate, history(new Date(NOW.getTime() - 5 * DAY).toISOString()), NOW)).toMatchObject({ state: 'held', rule: 'gap' })
  })
})

describe('Test 2: one organiser, three nights, each judged on its own', () => {
  const world = (touches: Touch[]): World => ({ nights: [NIGHT_A, NIGHT_B, NIGHT_C], approved: ['e-a'], touches })

  it('the approved night is never asked, the night already asked is not asked again, and the night never asked is due', async () => {
    const read = await readPerm(fakeDb(world([sentAbout('e-b', '2026-10-10T20:00:00Z')])))
    expect(read).toMatchObject({ state: 'read', eventId: 'e-c' })
  })

  it('one letter at a time: once the request for night C is going, nothing more is due until another night needs one', async () => {
    const going: Touch = { contact_id: CONTACT.id, state: 'queued', play_id: 'play-perm', comms_subtype: 'PERM-IMAGE', sent_at: null, scheduled_for: '2026-11-13T20:00:00Z', context_key: 'event:e-c' }
    const read = await readPerm(fakeDb(world([sentAbout('e-b', '2026-10-10T20:00:00Z'), going])))
    expect(read.state).toBe('not due')
  })
})

describe('a letter that names no night (the 16 already sent) still covers the nights it asked about', () => {
  it('a null context letter covers every night of theirs listed and ahead when it went; a night listed after it is due', async () => {
    const legacy = sentAbout(null, '2026-10-12T20:00:00Z')
    // A and B were listed on 1 October, before the letter of 12 October: both covered. C was listed on 1 November: due.
    const read = await readPerm(fakeDb({ nights: [NIGHT_A, NIGHT_B, NIGHT_C], touches: [legacy], listed: { 'e-a': '2026-10-01T00:00:00Z', 'e-b': '2026-10-01T00:00:00Z', 'e-c': '2026-11-01T00:00:00Z' } }))
    expect(read).toMatchObject({ state: 'read', eventId: 'e-c' })
  })

  it('every night it covered stays asked: nothing already asked is asked again', async () => {
    const read = await readPerm(fakeDb({ nights: [NIGHT_A, NIGHT_B], touches: [sentAbout(null, '2026-10-12T20:00:00Z')] }))
    expect(read.state).toBe('not due')
  })
})

describe('the free promotion offer stays one per organiser, as the code has it', () => {
  it('an ACQ letter going or sent to them still means no second offer, whichever night', async () => {
    const acq: Touch = { contact_id: CONTACT.id, state: 'sent', play_id: 'play-acq', comms_subtype: 'ACQ-FIRST', sent_at: '2026-10-10T20:00:00Z', context_key: 'event:e-b' }
    const read = await readLifecycleFacts(fakeDb({ nights: [night('e-x', '2026-12-04T09:00:00Z')], touches: [acq] }), { key: 'lifecycle_acq', playId: 'play-acq2', contactId: CONTACT.id, now: NOW, origin: ORIGIN })
    expect(read.state).toBe('not due')
  })
})

describe('which nights a request asked about, and every request records its night', () => {
  it('a request naming its night asked about that night; one naming none, about every night listed and ahead when it went', async () => {
    const { nightsAskedAbout } = await import('@/lib/outreach/lifecycle-letters')
    const nights = [
      { eventId: 'e-a', startIso: '2026-12-09T09:00:00Z', listedIso: '2026-10-01T00:00:00Z' },
      { eventId: 'e-b', startIso: '2026-12-10T09:00:00Z', listedIso: '2026-11-01T00:00:00Z' },
      { eventId: 'e-c', startIso: '2026-10-05T09:00:00Z', listedIso: '2026-09-01T00:00:00Z' },
    ]
    expect([...nightsAskedAbout([{ contextKey: 'event:e-b', wentIso: '2026-11-10T00:00:00Z' }], nights)]).toEqual(['e-b'])
    // Went 12 October: e-a listed and ahead (covered); e-b listed later (not); e-c already over by then (not).
    expect([...nightsAskedAbout([{ contextKey: null, wentIso: '2026-10-12T00:00:00Z' }], nights)]).toEqual(['e-a'])
    // A letter whose moment is not known covers every night: nothing already asked is asked again.
    expect([...nightsAskedAbout([{ contextKey: null, wentIso: null }], nights)].sort()).toEqual(['e-a', 'e-b', 'e-c'])
    expect([...nightsAskedAbout([], nights)]).toEqual([])
  })

  it("law 49's request and segment A's both write the night they ask about into the context (event:<id>)", async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of ['lifecycle-play.ts', 'segment-a-play.ts']) {
      expect(readFileSync(`src/lib/outreach/${file}`, 'utf8'), file).toMatch(/contextKey: (input\.first \? \(input\.first\.contextKey \?\? null\) : )?contextKeys\.event\(read\.eventId\)/)
    }
  })
})
