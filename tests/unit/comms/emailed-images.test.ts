import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { NIGHT, NOW, OTHER, SENDER, media, png, reply, world } from '../../helpers/emailed-media-harness'

/*
 * AN ORGANISER'S EMAILED ATTACHMENT IS INGESTED (the master directive's A3 (1); the PM's 12:18 item 4 of 23 November
 * 2026: "THE DEFECT: an organiser's emailed attachment is never ingested. Fix the cause: a reply's image attachments
 * from an organiser with a grant or pending request are recorded as candidate assets for that event, matched to the
 * grant, so nobody asks twice for a file already sent").
 *
 * THE INCIDENT, AS A SAFE FIXTURE: on 9 November 2026 an organiser answered a request for the night's poster with the
 * poster itself, a 1122 x 1402 PNG named the way a social tile is named. The inbox run logged the reply and copied
 * nothing; the engine went on with a phone screenshot. Here the same shape of reply goes through the inbox run itself
 * (handleInbox) with the attachment intake the run passes, and the register must hold the poster: stored, whole, its
 * provenance and its file recorded, for its night, under its grant, never shown until a person approves it.
 */

vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => [NIGHT, OTHER]) }))
const { handleInbox } = await import('@/lib/outreach/replies')

const POSTER_NAME = 'Melbourne_Performer Name_The Poster Night_FB post_new.png'
const run = (db: Parameters<typeof handleInbox>[0], messages: Parameters<typeof handleInbox>[1], files: () => Promise<{ name: string; contentType: string; bytes: ArrayBuffer }[]>, stored: string[], removed: string[] = []) =>
  handleInbox(db, messages, { mailbox: 'lawal@eventlinqs.com', origin: 'https://www.eventlinqs.com.au', actingUser: 'user-lawal', now: NOW, intake: { files, media: media(stored, removed) } } as never)

describe('THE POSTER IN THE REPLY REACHES THE REGISTER', () => {
  it('a reply to our photo request, with the poster attached, from an organiser whose grant covers the night: stored, registered for that night as artwork kept whole, matched to the grant, pending', async () => {
    const bytes = await png(1122, 1402)
    const w = world({ grantFor: [NIGHT.eventId] })
    const stored: string[] = []
    const report = await run(w.db, [reply()], async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes }], stored)

    expect(stored).toHaveLength(1)
    const rows = w.tables.social_assets
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({
      event_id: NIGHT.eventId,
      asset_state: 'organiser_authorised',
      asset_type: 'artwork',
      restrictions: "Kept whole: the organiser's own finished design, shown as they made it, never cropped or changed.",
      source_url: `mailto:${SENDER}`,
      rights_holder: 'Community Theatre of Melbourne',
      received_on: '2026-11-09',
      original_file: stored[0],
      source_width: 1122,
      source_height: 1402,
      content_sha256: createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      byte_size: bytes.byteLength,
      file_format: 'png',
    })
    // Its provenance: the message, the sender, when, and the file's own name.
    expect(row.evidence_file).toBe(`email <reply-1@theatre.example> from ${SENDER}, received 2026-11-09T02:15:00Z, attachment "${POSTER_NAME}"`)
    // Never shown until a person approves it: the register's default, pending, is never overridden here.
    expect(row.approval_status ?? 'pending').toBe('pending')
    // The permission evidence is the database's to write from the grant (social_asset_takes_the_yes), never typed here.
    expect(row.permission_evidence).toBeNull()
    expect(report.replies[0].action).toMatch(/1 image kept as candidates for The Poster Night/)
  }, 30000)

  it('with our request open and no grant yet: registered for the night as a native share, which nothing ever shows, for their yes to turn authorised', async () => {
    const w = world({ grantFor: [] })
    await run(w.db, [reply()], async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes: await png(1122, 1402) }], [])
    expect(w.tables.social_assets).toHaveLength(1)
    expect(w.tables.social_assets[0]).toMatchObject({ event_id: NIGHT.eventId, asset_state: 'native_share', permitted_uses: null })
  }, 30000)

  it('a thread that names no night of theirs: kept with no night, for review, never put on their other night', async () => {
    const w = world({ grantFor: [] })
    // Written fresh, not in reply to any letter of ours; their address is on record and our photo request is open.
    await run(w.db, [reply({ inReplyTo: null, subject: 'Our poster' })], async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes: await png(1122, 1402) }], [])
    expect(w.tables.social_assets).toHaveLength(1)
    expect(w.tables.social_assets[0].event_id).toBeNull()
    expect(w.tables.social_assets[0].asset_state).toBe('native_share')
  }, 30000)

  it('no grant and no request of ours open: nothing is stored or registered, and the reply says why', async () => {
    const w = world({ grantFor: [], requestOpen: false })
    const stored: string[] = []
    const report = await run(w.db, [reply({ inReplyTo: null })], async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes: await png(600, 750) }], stored)
    expect(stored).toHaveLength(0)
    expect(w.tables.social_assets).toHaveLength(0)
    expect(report.replies[0].action).toMatch(/its attachments stay in the mailbox: no grant of theirs and no photo request of ours is open/)
  }, 30000)

  it("a reply from a contact of the platform's own listings organisation: it is no host, so nothing is stored or registered, and the reply says why (the guard growth-reads-skip-the-platform)", async () => {
    const w = world({ grantFor: [NIGHT.eventId] })
    w.tables.organisations = [{ id: 'org-platform', slug: 'eventlinqs-listings' }]
    w.tables.organisers[0].organisation_id = 'org-platform'
    const stored: string[] = []
    const report = await run(w.db, [reply()], async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes: await png(1122, 1402) }], stored)
    expect(stored).toHaveLength(0)
    expect(w.tables.social_assets).toHaveLength(0)
    expect(report.replies[0].action).toMatch(/its attachments stay in the mailbox: the sender is a contact of the platform's own listings organisation, which is no host/)
  }, 30000)

  it('the same file sent twice is registered once', async () => {
    const bytes = await png(1122, 1402)
    const w = world({ grantFor: [NIGHT.eventId] })
    const stored: string[] = []
    const files = async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes }]
    await run(w.db, [reply()], files, stored)
    const second = await run(w.db, [reply({ internetMessageId: '<reply-2@theatre.example>' })], files, stored)
    expect(w.tables.social_assets).toHaveLength(1)
    expect(stored).toHaveLength(1)
    expect(second.replies[0].action).toMatch(/0 images kept as candidates for The Poster Night; 1 already in the register/)
  }, 30000)

  it('a file that is not an image, whatever its name says, never enters: refused in words, nothing stored or registered', async () => {
    const w = world({ grantFor: [NIGHT.eventId] })
    const stored: string[] = []
    const fake = new TextEncoder().encode('<html><script>alert(1)</script></html>  padding padding').buffer as ArrayBuffer
    const report = await run(w.db, [reply()], async () => [{ name: 'poster.png', contentType: 'image/png', bytes: fake }], stored)
    expect(stored).toHaveLength(0)
    expect(w.tables.social_assets).toHaveLength(0)
    expect(report.replies[0].action).toMatch(/not kept: poster\.png: /)
  }, 30000)

  it('a stop with an attachment takes nothing', async () => {
    const w = world({ grantFor: [NIGHT.eventId] })
    const files = vi.fn(async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes: await png(1122, 1402) }])
    await run(w.db, [reply({ text: 'Please stop emailing us. Poster attached for your records.' })], files, [])
    expect(files).not.toHaveBeenCalled()
    expect(w.tables.social_assets).toHaveLength(0)
  }, 30000)

  it('A FAILURE IS SEEN AND TAKEN AGAIN: a mailbox read that fails is written on the reply, and the next run that reads the message keeps the file', async () => {
    const w = world({ grantFor: [NIGHT.eventId] })
    const bytes = await png(1122, 1402)
    const first = await run(w.db, [reply()], async () => {
      throw new Error('Graph read 503')
    }, [])
    expect(first.replies[0].action).toMatch(/its attachments were not kept \(Graph read 503\); the next run takes them again/)
    expect(w.tables.social_assets).toHaveLength(0)
    // The next run reads the same message: the database refuses a second reply row by its message id, as it does.
    const inserts = (table: string) => (w.db as unknown as { from: (t: string) => Record<string, unknown> }).from(table)
    const db = {
      ...w.db,
      from: (table: string) => {
        const t = inserts(table)
        if (table !== 'outreach_replies') return t
        return {
          ...t,
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'duplicate key value violates unique constraint "outreach_replies_one_per_message"' } }) }) }),
        }
      },
    }
    await run(db as never, [reply()], async () => [{ name: POSTER_NAME, contentType: 'image/png', bytes }], [])
    expect(w.tables.social_assets).toHaveLength(1)
    expect(String(w.tables.outreach_replies[0].action_taken)).toMatch(/1 image kept as candidates for The Poster Night/)
    expect(String(w.tables.outreach_replies[0].action_taken)).not.toMatch(/not kept/)
  }, 30000)
})

describe('a poster is artwork, kept whole; a camera photograph is a photo', () => {
  it('reads the file name first, then their words; where neither says, kept whole', async () => {
    const { emailedAssetType } = await import('@/lib/comms/emailed-media')
    expect(emailedAssetType(POSTER_NAME, 'Here it is')).toBe('artwork')
    expect(emailedAssetType('Show_Flyer_A4.jpg', 'photos attached')).toBe('artwork')
    expect(emailedAssetType('IMG_6082.JPG', 'the poster is attached')).toBe('photo')
    expect(emailedAssetType('PXL_20261101_0930.jpg', '')).toBe('photo')
    expect(emailedAssetType('crowd.jpg', 'A few photos from last year attached')).toBe('photo')
    expect(emailedAssetType('crowd.jpg', 'Our poster and a few photos attached')).toBe('artwork')
    expect(emailedAssetType('image001.png', '')).toBe('artwork')
  })

  it("the night is the thread's own, by our letter's context or its subject, never another night of theirs", async () => {
    const { nightOfThread } = await import('@/lib/comms/emailed-media')
    expect(nightOfThread({ subject: 'anything', context_key: `event:${OTHER.eventId}` }, [NIGHT, OTHER])?.eventId).toBe(OTHER.eventId)
    expect(nightOfThread({ subject: 'Helping more people find The Poster Night on 5 December', context_key: null }, [NIGHT, OTHER])?.eventId).toBe(NIGHT.eventId)
    expect(nightOfThread({ subject: 'Hello', context_key: null }, [NIGHT, OTHER])).toBeNull()
    expect(nightOfThread(null, [NIGHT])).toBeNull()
    // A context naming a night that is not theirs, or no longer ahead, names none.
    expect(nightOfThread({ subject: null, context_key: 'event:6f1c2a30-0000-4000-8000-0000000000ff' }, [NIGHT])).toBeNull()
  })
})
