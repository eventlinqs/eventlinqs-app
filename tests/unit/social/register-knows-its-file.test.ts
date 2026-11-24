import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { addAsset, type AssetInput } from '@/lib/social/store'
import { givePhotos } from '@/lib/listings/photo-permission'
import type { Database } from '@/types/database'
import { media } from '../../helpers/emailed-media-harness'

/*
 * THE REGISTER KNOWS ITS FILE (the master directive's A3 (3); Lawal's 12:34 of 23 November 2026, the media library's
 * fields: "File type and dimensions: determines technical suitability", "Integrity reference: helps detect duplicates and
 * preserve provenance"). Only the fields the approved document keeps and the register lacked: the file's SHA-256 (the
 * same file is never registered twice), its size in bytes and its format. Its pixel size had its columns already
 * (source_width, source_height), and the photo page left them empty, so the lifecycle planner, which reads a photo with
 * no size as no photo (src/lib/social/lifecycle-plan.ts), passed every organiser's own photo by.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')

describe('the register has the file columns, and one file is one row', () => {
  it('a migration adds content_sha256, byte_size and file_format, with a unique index on the hash, and touches no row', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const file = readdirSync(dir).find((f) => /^\d{14}_the_register_knows_its_file\.sql$/.test(f))
    expect(file, 'the migration').toBeDefined()
    const sql = read('supabase', 'migrations', file as string)
    expect(sql).toMatch(/add column if not exists content_sha256 text check \(content_sha256 is null or content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(sql).toMatch(/add column if not exists byte_size integer check \(byte_size is null or byte_size > 0\)/)
    expect(sql).toMatch(/add column if not exists file_format text check \(file_format is null or file_format in \('jpeg', 'png', 'webp', 'avif', 'heic'\)\)/)
    expect(sql).toMatch(/create unique index if not exists social_assets_one_file on public\.social_assets \(content_sha256\) where content_sha256 is not null;/)
    expect(sql).not.toMatch(/^\s*(update|delete|drop table|truncate)\b/im)
  })
})

/** The register's one writer, with the database stood in: what it inserts, and a refusal when asked to give one. */
function registerDb(refuse?: { code: string; message: string }) {
  const inserts: Record<string, unknown>[] = []
  const client = {
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'limit', 'neq', 'in', 'order']) b[m] = () => b
      b.maybeSingle = async () => ({ data: table === 'events' ? { id: 'night-1' } : { id: 'asset-1' }, error: null })
      b.single = b.maybeSingle
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [{ id: 'asset' }], error: null })
      return {
        ...b,
        select: () => b,
        update: () => b,
        insert: async (payload: Record<string, unknown>) => {
          inserts.push(payload)
          return { data: null, error: refuse ?? null }
        },
      }
    },
    rpc: async () => ({ data: 'yes-id', error: null }),
  }
  return { client: client as unknown as SupabaseClient<Database>, inserts }
}

const INPUT: AssetInput & { by: string } = {
  assetState: 'organiser_authorised',
  assetType: 'artwork',
  assetUrl: 'https://example.supabase.co/storage/v1/object/public/organiser-media/emailed/night-1/a.jpg',
  sourceUrl: 'mailto:organiser@theatre.example',
  rightsHolder: 'Community Theatre of Melbourne',
  permissionEvidence: null,
  evidenceFile: 'email <reply-1@theatre.example>',
  eventSlug: 'the-poster-night',
  attributionText: 'Community Theatre of Melbourne',
  scope: 'both',
  archival: false,
  expiresAt: null,
  restrictions: null,
  originalFile: 'emailed/night-1/a.jpg',
  receivedOn: '2026-11-09',
  permittedUses: null,
  focal: null,
  sourceWidth: 1122,
  sourceHeight: 1402,
  leadRank: null,
  contentSha256: 'a'.repeat(64),
  byteSize: 734_512,
  fileFormat: 'png',
  by: 'user-lawal',
}

describe("the register's one writer keeps the file's hash, bytes and format", () => {
  it('writes them as given', async () => {
    const { client, inserts } = registerDb()
    expect(await addAsset(client, INPUT)).toEqual({ state: 'done' })
    expect(inserts[0]).toMatchObject({ content_sha256: 'a'.repeat(64), byte_size: 734_512, file_format: 'png', source_width: 1122, source_height: 1402 })
  })

  it("a row with no file in hand (the admin's add by address) writes none, as before", async () => {
    const { client, inserts } = registerDb()
    const { contentSha256: _h, byteSize: _b, fileFormat: _f, ...byAddress } = INPUT
    await addAsset(client, byAddress)
    expect(inserts[0]).toMatchObject({ content_sha256: null, byte_size: null, file_format: null })
  })

  it('the same file a second time is refused in words that say so, apart from the same address for the same night', async () => {
    const file = registerDb({ code: '23505', message: 'duplicate key value violates unique constraint "social_assets_one_file"' })
    expect(await addAsset(file.client, INPUT)).toEqual({ state: 'refused', reason: 'This file is in the register already.' })
    const address = registerDb({ code: '23505', message: 'duplicate key value violates unique constraint "social_assets_once"' })
    expect(await addAsset(address.client, INPUT)).toEqual({ state: 'refused', reason: 'This asset is in the register for that night already.' })
  })
})

describe('the photo page writes its file and its pixel size', () => {
  it("an organiser's photo through the one tick is registered with its SHA-256, bytes, format and its own width and height", async () => {
    const jpeg = await sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg({ quality: 85 }).toBuffer()
    const file = new File([new Uint8Array(jpeg)], 'IMG_0101.jpg', { type: 'image/jpeg' })
    const { client, inserts } = registerDb()
    const page = {
      state: 'found' as const,
      contactId: 'ec53cfcd-f5f7-444d-a3ec-591952c7ab2a',
      organiserName: 'Community Theatre of Melbourne',
      greeting: 'Ira',
      nights: [{ eventId: 'night-1', slug: 'the-poster-night', title: 'The Poster Night', startDate: '2026-12-05T07:30:00+00:00', timezone: 'Australia/Melbourne', venueName: 'The Hall' }],
      preselect: null,
    }
    const done = await givePhotos(client, { page, eventId: 'night-1', files: [file], givenBy: 'Ira', now: new Date('2026-11-24T01:00:00Z') }, media([]))
    expect(done).toMatchObject({ state: 'done', added: 1 })
    expect(inserts[0]).toMatchObject({
      content_sha256: createHash('sha256').update(jpeg).digest('hex'),
      byte_size: jpeg.byteLength,
      file_format: 'jpeg',
      source_width: 1600,
      source_height: 1067,
    })
  }, 30000)
})
