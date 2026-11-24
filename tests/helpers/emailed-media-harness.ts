/**
 * THE INBOX RUN WITH AN ORGANISER'S EMAILED IMAGES AND YES, ON SAFE TEST DATA (the master directive's A3; Lawal's 12:34
 * of 23 November 2026, section 9: "Include the Ukrainian theatre incident as a regression fixture using safe test data
 * rather than exposing private organiser correspondence").
 *
 * The organiser, the night, the sender and the files here are made up: a community theatre with two nights ahead, our
 * photo request about the first, and a reply carrying the night's poster as a 1122 x 1402 PNG named the way a social
 * tile is named, as the 9 November reply was. Images are real files made by sharp and pass through the photo page's own
 * processing and fingerprinting; the database is the in-memory outreach fake, with the three database functions the
 * intake calls answered as the database answers them (a grant covers a night once logged for it).
 */
import sharp from 'sharp'
import type { MediaDeps } from '@/lib/listings/organiser-media'
import { ImageRefusal } from '@/lib/listings/organiser-media'
import { processEventImage } from '@/lib/media/image-pipeline'
import { photoHashes } from '@/lib/images/photo-hash'
import type { InboundMessage } from '@/lib/outreach/graph'
import { fakeOutreachDb, type Row } from './outreach-db-fake'

export const NIGHT = { eventId: '6f1c2a30-0000-4000-8000-000000000001', slug: 'the-poster-night-the-hall-2026-12-05', title: 'The Poster Night', startDate: '2026-12-05T07:30:00+00:00', timezone: 'Australia/Melbourne', venueName: 'The Hall', isFree: false }
export const OTHER = { eventId: '6f1c2a30-0000-4000-8000-000000000002', slug: 'the-second-night-the-hall-2027-01-16', title: 'The Second Night', startDate: '2027-01-16T08:00:00+00:00', timezone: 'Australia/Melbourne', venueName: 'The Hall', isFree: false }
export const SENDER = 'organiser@theatre.example'
export const OUR_LETTER = '<perm-1@eventlinqs.com>'
export const NOW = new Date('2026-11-24T01:00:00Z')

/** A real PNG of the given size: a finished design, flat colour and a mark, as a poster exports. */
export async function png(width: number, height: number, shade = 40): Promise<ArrayBuffer> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: shade, g: 60, b: 140 } } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 3}" fill="#fc0"/></svg>`) }])
    .png()
    .toBuffer()
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** The photo page's own processing and fingerprinting (mediaDeps('gallery')), with the bucket stood in. */
export function media(stored: string[], removed: string[] = []): MediaDeps {
  return {
    hash: (bytes) => photoHashes(Buffer.from(bytes)),
    async process(bytes) {
      const result = await processEventImage(bytes, { role: 'gallery' })
      if (!result.ok) throw new ImageRefusal(result.error)
      return { buffer: result.image.buffer, extension: result.image.ext, contentType: result.image.contentType, width: result.image.width, height: result.image.height }
    },
    async store(path) {
      stored.push(path)
      return `https://example.supabase.co/storage/v1/object/public/organiser-media/${path}`
    },
    async remove(paths) {
      removed.push(...paths)
    },
    async rpc(name) {
      return name === 'photo_locked_elsewhere' ? { data: false, error: null } : { data: null, error: null }
    },
  }
}

/** The world: the organiser, their contact, our photo request (sent, about NIGHT), and the grants logged so far. */
export function world(opts: { grantFor?: readonly string[]; requestOpen?: boolean } = {}) {
  const grants: { id: string; event_id: string; args: Record<string, unknown> }[] = (opts.grantFor ?? []).map((e, i) => ({ id: `grant-${i + 1}`, event_id: e, args: {} }))
  const tables: Record<string, Row[]> = {
    organisers: [{ id: 'org-1', name: 'Community Theatre of Melbourne', organisation_id: null, website_url: null, is_test: false }],
    organiser_contacts: [{ id: 'contact-1', organiser_id: 'org-1', channel: 'email', address: SENDER, person_name: 'Ira' }],
    outreach_touches:
      opts.requestOpen === false
        ? []
        : [{ id: 'touch-1', contact_id: 'contact-1', internet_message_id: OUR_LETTER, subject: 'Photos for The Poster Night', context_key: `event:${NIGHT.eventId}`, state: 'sent', comms_subtype: 'PERM-IMAGE', sent_at: '2026-11-08T21:00:00Z' }],
    outreach_replies: [],
    social_assets: [],
    events: [
      { id: NIGHT.eventId, slug: NIGHT.slug },
      { id: OTHER.eventId, slug: OTHER.slug },
    ],
  }
  const yeses: Record<string, unknown>[] = []
  const fake = fakeOutreachDb(tables, {
    organiser_permission_for: (args) => {
      const g = grants.find((x) => x.event_id === (args as { p_event: string }).p_event)
      return g ? { id: g.id, event_id: g.event_id } : { id: null }
    },
    social_log_organiser_yes: (args) => {
      const a = args as Record<string, unknown>
      yeses.push(a)
      const id = `grant-${grants.length + 1}`
      grants.push({ id, event_id: a.p_event as string, args: a })
      return id
    },
  })
  return { ...fake, yeses, grants }
}

/** A message from the organiser, in reply to our letter unless told otherwise. */
export function reply(over: Partial<InboundMessage> & { inReplyTo?: string | null } = {}): InboundMessage {
  const { inReplyTo, ...rest } = over
  return {
    graphId: 'graph-1',
    internetMessageId: '<reply-1@theatre.example>',
    subject: 'Re: Photos for The Poster Night',
    fromAddress: SENDER,
    fromName: 'Ira',
    receivedAt: '2026-11-09T02:15:00Z',
    text: 'Hi Lawal,\n\nPlease find the original poster attached.\n\nIra',
    headers: inReplyTo === null ? {} : { 'in-reply-to': inReplyTo ?? OUR_LETTER },
    hasAttachments: true,
    ...rest,
  }
}
