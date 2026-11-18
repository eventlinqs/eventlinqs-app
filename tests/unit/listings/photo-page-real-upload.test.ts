import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { processEventImage } from '@/lib/media/image-pipeline'
import { EVENT_PHOTO_BOX, fitsEventPhotoBox } from '@/lib/media/limits'
import { photoHashes } from '@/lib/images/photo-hash'
import { ImageRefusal, type MediaDeps } from '@/lib/listings/organiser-media'
import { givePhotos } from '@/lib/listings/photo-permission'
import type { Database } from '@/types/database'

/*
 * THE PHOTO PAGE, DRIVEN WITH REAL PHOTOGRAPHS ON EVERY GATE (the PM's 09:45 of 19 November 2026, item 1 (c): "fix it at
 * its cause with a guard that drives a real upload through that page on every gate. This is a launch defect: every
 * letter we send points organisers at it").
 *
 * WHAT SHE HIT. Aria of Asia Oasis pressed the page at 23:50 on 18 November from an iPhone (audit_log 664): her yes was
 * logged and 0 images were kept. The page processed every photo as a COVER, whose floor is 1000 pixels wide, and her
 * festival photographs are 973 x 695 and 916 x 654; storeImage then threw the pipeline's words away and told her 'That
 * image could not be read. Try a JPEG or PNG.' about a good JPEG.
 *
 * Here the page's own press (givePhotos) runs with the page's own image processing and fingerprinting (the real sharp
 * pipeline, role 'gallery' as actions.ts passes it), real JPEG files of her sizes and of a phone's, and a stand-in only
 * for the database and the bucket. The drill shows the old processing red on her photo.
 */

/** A real JPEG of the given size, made by sharp, as a browser posts it. */
async function jpeg(name: string, width: number, height: number): Promise<File> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 180, g: 60, b: 40 } } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#fc0"/></svg>`) }])
    .jpeg({ quality: 85 })
    .toBuffer()
  return new File([new Uint8Array(buf)], name, { type: 'image/jpeg' })
}

/** The page's own processing, as mediaDeps(role) builds it, with the bucket stood in. */
function deps(role: 'cover' | 'gallery', stored: string[]): MediaDeps {
  return {
    hash: (bytes) => photoHashes(Buffer.from(bytes)),
    async process(bytes) {
      const result = await processEventImage(bytes, { role })
      if (!result.ok) throw new ImageRefusal(result.error)
      return { buffer: result.image.buffer, extension: result.image.ext, contentType: result.image.contentType, width: result.image.width, height: result.image.height }
    },
    async store(path) {
      stored.push(path)
      return `https://example.supabase.co/storage/v1/object/public/organiser-media/${path}`
    },
    async remove() {},
    async rpc(name) {
      return name === 'photo_locked_elsewhere' ? { data: false, error: null } : { data: null, error: null }
    },
  }
}

/** The database the press reads and writes, answering as production did for her night. */
function db() {
  const writes: { table: string; op: string; payload?: unknown }[] = []
  let assetId = 0
  const answer = (table: string, op: string, payload?: unknown) => {
    if (table === 'admin_users') return { data: [{ id: 'founder' }], error: null }
    if (table === 'events' && op === 'select') return { data: { id: 'night-20' }, error: null }
    if (table === 'social_assets' && op === 'insert') return { data: null, error: null }
    if (table === 'social_assets' && op === 'select') return { data: { id: `asset-${++assetId}` }, error: null }
    if (table === 'social_assets' && op === 'update') return { data: [{ id: 'asset' }], error: null }
    if (table === 'event_image_rights') return { data: { rights_state: 'original_design' }, error: null }
    if (table === 'events' && op === 'update') return { data: null, error: null }
    return { data: null, error: { message: `unexpected ${op} on ${table} ${JSON.stringify(payload ?? null).slice(0, 40)}` } }
  }
  const chain = (table: string, op: string, payload?: unknown) => {
    writes.push({ table, op, payload })
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'limit', 'neq', 'in', 'order']) b[m] = () => b
    b.single = async () => answer(table, op, payload)
    b.maybeSingle = async () => answer(table, op, payload)
    b.then = (resolve: (v: unknown) => unknown) => resolve(answer(table, op, payload))
    return b
  }
  const client = {
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      insert: (payload: unknown) => chain(table, 'insert', payload),
      update: (payload: unknown) => chain(table, 'update', payload),
    }),
    rpc: async () => ({ data: 'yes-id', error: null }),
  }
  return { client: client as unknown as SupabaseClient<Database>, writes }
}

const PAGE = {
  state: 'found' as const,
  contactId: 'ec53cfcd-f5f7-444d-a3ec-591952c7ab2a',
  organiserName: 'Asia Oasis',
  greeting: 'Asia Oasis team',
  nights: [{ eventId: 'night-20', slug: 'colours-of-asia-garden-of-wonders-asia-oasis-2026-11-20', title: 'Colours of Asia: Garden of Wonders', startDate: '2026-11-20T00:00:00+00:00', timezone: 'Australia/Melbourne', venueName: 'Alexandra Gardens' }],
  preselect: null,
}
const NOW = new Date('2026-11-18T12:50:05Z')

describe('the photo page keeps a real organiser photo', () => {
  it("her three festival photographs (973 x 695, 1000 x 714, 916 x 654) are all kept, applied, and the first made the night's cover", async () => {
    const stored: string[] = []
    const { client, writes } = db()
    const files = [await jpeg('IMG_6082.jpg', 973, 695), await jpeg('IMG_6081.jpg', 1000, 714), await jpeg('IMG_6085.jpg', 916, 654)]
    const done = await givePhotos(client, { page: PAGE, eventId: 'night-20', files, uses: 'both', givenBy: 'Aria', now: NOW }, deps('gallery', stored))
    expect(done).toMatchObject({ state: 'done', added: 3, refused: [], applied: 3, coverSet: true })
    expect(stored).toHaveLength(3)
    expect(writes.filter((w) => w.table === 'social_assets' && w.op === 'insert')).toHaveLength(3)
  }, 30000)

  it("a phone's full size photograph (4032 x 3024) is kept", async () => {
    const { client } = db()
    const done = await givePhotos(client, { page: PAGE, eventId: 'night-20', files: [await jpeg('IMG_0001.jpg', 4032, 3024)], uses: 'site', givenBy: 'Aria', now: NOW }, deps('gallery', []))
    expect(done).toMatchObject({ state: 'done', added: 1, refused: [] })
  }, 30000)

  it('a photo the page would have to enlarge is refused in words that say what fits; an unreadable file is the only one "could not be read"', async () => {
    const { client } = db()
    const small = await jpeg('small.jpg', 600, 400)
    const broken = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'broken.jpg', { type: 'image/jpeg' })
    const done = await givePhotos(client, { page: PAGE, eventId: 'night-20', files: [small, broken], uses: 'site', givenBy: 'Aria', now: NOW }, deps('gallery', []))
    expect(done).toMatchObject({ state: 'done', added: 0 })
    const refused = (done as { refused: readonly string[] }).refused
    expect(refused[0]).toBe(`small.jpg: it is 600 x 400 pixels, so your event page would have to enlarge it; a photo at least ${EVENT_PHOTO_BOX.height} pixels tall, or ${EVENT_PHOTO_BOX.width} wide, shows sharp.`)
    expect(refused[1]).toMatch(/^broken\.jpg: /)
    expect(refused.join(' ')).not.toMatch(/small\.jpg: That image could not be read/)
  }, 30000)

  it("DRILL: the old processing (role 'cover') refuses her 973 x 695 photo; the reason it gives is now the pipeline's own, never 'could not be read'", async () => {
    const { client } = db()
    const done = await givePhotos(client, { page: PAGE, eventId: 'night-20', files: [await jpeg('IMG_6082.jpg', 973, 695)], uses: 'both', givenBy: 'Aria', now: NOW }, deps('cover', []))
    expect(done).toMatchObject({ state: 'done', added: 0 })
    const said = (done as { refused: readonly string[] }).refused[0]
    expect(said).toMatch(/too small for a cover \(973px wide\)/)
    expect(said).not.toMatch(/could not be read/)
  }, 30000)

  it("the page's own press passes the gallery role, and the box rule is the page's", () => {
    const action = readFileSync(join(process.cwd(), 'src/app/photos/[contact]/[proof]/actions.ts'), 'utf8')
    expect(action).toMatch(/mediaDeps\('gallery'\)/)
    expect(fitsEventPhotoBox(916, 654)).toBe(true)
    expect(fitsEventPhotoBox(1336, 300)).toBe(true)
    expect(fitsEventPhotoBox(1000, 500)).toBe(false)
  })
})
