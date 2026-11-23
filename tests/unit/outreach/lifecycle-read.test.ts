import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { photoProof } from '@/lib/outreach/photo-link'
import { renderTemplate } from '@/lib/outreach/rules'
import { LIFECYCLE_PERM, lifecycleFields } from '@/lib/outreach/lifecycle-letters'
import { LIFECYCLE_PERM_FOLLOW_UP } from '@/lib/outreach/perm-follow-up'

/*
 * WHAT A LAW 49 LETTER READS (src/lib/outreach/lifecycle-read.ts), driven with the database stood in. The approval link
 * the permission request names is the organiser's own photo page (Lawal, 13:49 of 23 November 2026: "One tick ... We are
 * just promoting the event"): /photos/<contact id>/<photoProof(that contact's unsubscribe token)>, the contact being the
 * one the letter goes to. A contact with no token has no link, and the draft is held for it.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000`
const SAT_14_7AM = new Date('2026-11-13T20:00:00Z') // Saturday 14 November, 07:00 in Melbourne: T-27 to Gallery Tots
const NIGHT = { eventId: 'e-tots', slug: 'gallery-tots-geelong-gallery-2026-12-11', title: 'Gallery Tots', startDate: '2026-12-10T23:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Geelong Gallery', isFree: false }
const COVER = 'https://example.supabase.co/storage/v1/object/public/event-images/stand-in/tots.avif'

vi.mock('@/lib/growth/platform-organiser', () => ({ readPlatformOrganiserIds: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => [NIGHT]) }))
const { readLifecycleFacts } = await import('@/lib/outreach/lifecycle-read')

type Contact = { id: string; channel: string; address: string; person_name: string | null; unsubscribe_token: string | null; basis: string; published_on_url: string | null; no_marketing_statement_checked: boolean }
type World = {
  contacts: Contact[]
  touches?: { contact_id: string; state: string; play_id: string | null; comms_subtype: string; sent_at: string | null }[]
  coverRights?: { event_id: string; image_url: string; rights_state: string }[]
  assets?: { event_id: string; asset_state: string; withdrawal_status: string; approval_status: string }[]
}

/** The rows production would answer for one organiser, Geelong Gallery, read by table and by the filters applied. */
function fakeDb(world: World) {
  const reads: { table: string; filters: [string, string, unknown][] }[] = []
  const answer = (table: string, columns: string, filters: [string, string, unknown][]) => {
    const has = (op: string, col: string) => filters.find((f) => f[0] === op && f[1] === col)?.[2]
    if (table === 'organiser_contacts' && columns === 'organiser_id') return { data: { organiser_id: 'o-gallery' }, error: null }
    if (table === 'organiser_contacts') return { data: world.contacts, error: null }
    if (table === 'outreach_touches') return { data: world.touches ?? [], error: null }
    if (table === 'outreach_replies') return { data: [], error: null }
    if (table === 'organisers') return { data: { id: 'o-gallery', name: 'Geelong Gallery', organisation_id: null, website_url: 'https://www.geelonggallery.org.au' }, error: null }
    if (table === 'events') return { data: [{ id: NIGHT.eventId, end_date: null, city_primary: 'geelong', external_ticket_url: 'https://events.humanitix.com/gallery-tots', cover_image_url: COVER }], error: null }
    if (table === 'event_image_rights') return { data: world.coverRights ?? [], error: null }
    if (table === 'event_booking_links') return { data: [], error: null }
    if (table === 'social_assets') {
      // Exactly the filters the reader applies, so a row it should not count is never counted by the stand in either.
      const rows = (world.assets ?? []).filter(
        (a) =>
          ((has('in', 'event_id') as string[] | undefined) ?? []).includes(a.event_id) &&
          (has('eq', 'asset_state') === undefined || a.asset_state === has('eq', 'asset_state')) &&
          (has('eq', 'withdrawal_status') === undefined || a.withdrawal_status === has('eq', 'withdrawal_status')) &&
          (has('neq', 'approval_status') === undefined || a.approval_status !== has('neq', 'approval_status')),
      )
      return { data: rows, error: null }
    }
    return { data: null, error: { message: `unexpected read of ${table}` } }
  }
  const db = {
    from: (table: string) => ({
      select: (columns: string) => {
        const filters: [string, string, unknown][] = []
        reads.push({ table, filters })
        const b: Record<string, unknown> = {}
        for (const op of ['eq', 'in', 'neq']) b[op] = (col: string, v: unknown) => (filters.push([op, col, v]), b)
        b.limit = () => b
        b.order = () => b
        b.single = async () => answer(table, columns, filters)
        b.maybeSingle = async () => answer(table, columns, filters)
        b.then = (resolve: (v: unknown) => unknown) => resolve(answer(table, columns, filters))
        return b
      },
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, reads }
}

const INFO: Contact = {
  id: '3f2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f',
  channel: 'email',
  address: 'info@geelonggallery.org.au',
  person_name: null,
  unsubscribe_token: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  basis: 'conspicuous_publication',
  published_on_url: 'https://www.geelonggallery.org.au/contact',
  no_marketing_statement_checked: true,
}

const readPerm = (db: SupabaseClient<Database>, contactId = INFO.id) =>
  readLifecycleFacts(db, { key: 'lifecycle_perm', playId: 'play-perm', contactId, now: SAT_14_7AM, origin: ORIGIN })

describe("the permission request's approval link is the contact's own photo page", () => {
  it('filled from photoProof of the token of the contact written to, so the letter is not held for it', async () => {
    const { db } = fakeDb({ contacts: [INFO] })
    const read = await readPerm(db)
    expect(read.state).toBe('read')
    if (read.state !== 'read') return
    const link = `${ORIGIN}/photos/${INFO.id}/${photoProof(INFO.unsubscribe_token as string)}`
    expect(read.facts.approvalLink).toBe(link)
    // The one builder: the same link the upload page always had, never a second one.
    expect(read.facts.photoLink).toBe(link)
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(read.facts), UNSUB)
    expect(r.body).toContain(`You can review the image and approve its use here: ${link}.`)
    expect(r.heldBecause.join(' ')).not.toContain('[approval link]')
    // Its one follow up names the same page.
    expect(renderTemplate(LIFECYCLE_PERM_FOLLOW_UP, lifecycleFields(read.facts), UNSUB).body).toContain(`you can confirm here: ${link}.`)
  })

  it('built for the contact the organiser was already written at, never the one the cohort reached', async () => {
    const thread: Contact = { ...INFO, id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', address: 'bookings@geelonggallery.org.au', unsubscribe_token: 'b1e2c3d4-0000-4000-8000-000000000001' }
    const { db } = fakeDb({ contacts: [INFO, thread], touches: [{ contact_id: thread.id, state: 'sent', play_id: 'play-acq', comms_subtype: 'ACQ-FIRST', sent_at: '2026-11-10T20:00:00Z' }] })
    const read = await readPerm(db)
    if (read.state !== 'read') throw new Error(`not read: ${read.why}`)
    expect(read.recipientId).toBe(thread.id)
    expect(read.facts.approvalLink).toBe(`${ORIGIN}/photos/${thread.id}/${photoProof(thread.unsubscribe_token as string)}`)
  })

  it('a contact with no unsubscribe token gets no link, and the draft stays held for [approval link]', async () => {
    const { db } = fakeDb({ contacts: [{ ...INFO, unsubscribe_token: null }] })
    const read = await readPerm(db)
    if (read.state !== 'read') throw new Error(`not read: ${read.why}`)
    expect(read.facts.approvalLink).toBeNull()
    expect(read.facts.photoLink).toBeNull()
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(read.facts), UNSUB)
    expect(r.heldBecause).toContain('a field could not be filled from verified facts: [approval link]')
    expect(r.body).not.toMatch(/\/photos\//)
  })
})

describe('an organiser who already gave images for the night is never asked for them again', () => {
  const gave = (over: Partial<NonNullable<World['assets']>[number]> = {}) => ({ event_id: NIGHT.eventId, asset_state: 'organiser_authorised', withdrawal_status: 'current', approval_status: 'approved', ...over })

  it('a current organiser authorised image for that night, of any scope and not its cover, means no PERM', async () => {
    for (const approval of ['approved', 'pending']) {
      const { db, reads } = fakeDb({ contacts: [INFO], assets: [gave({ approval_status: approval })] })
      const read = await readPerm(db)
      expect(read.state, approval).toBe('not due')
      if (read.state === 'read') return
      expect(read.why).toMatch(/needs a photo asked for before T-28: .*has images they gave us/)
      // Any scope counts ('site', 'social', 'both', or the one tick's): the read never narrows by it.
      const assetRead = reads.find((r) => r.table === 'social_assets')!
      expect(assetRead.filters.map((f) => f[1])).not.toContain('scope')
    }
  })

  it('their own cover with recorded rights still means no PERM, as before', async () => {
    const { db } = fakeDb({ contacts: [INFO], coverRights: [{ event_id: NIGHT.eventId, image_url: COVER, rights_state: 'organiser_authorised' }] })
    expect((await readPerm(db)).state).toBe('not due')
  })

  it('CONTROL: nothing given, or only an image withdrawn, refused, or for another night, and the request is due', async () => {
    for (const assets of [[], [gave({ withdrawal_status: 'withdrawn' })], [gave({ withdrawal_status: 'replaced' })], [gave({ approval_status: 'refused' })], [gave({ event_id: 'another-night' })], [gave({ asset_state: 'separately_licensed' })]]) {
      const { db } = fakeDb({ contacts: [INFO], assets })
      const read = await readPerm(db)
      expect(read.state, JSON.stringify(assets)).toBe('read')
    }
  })
})
