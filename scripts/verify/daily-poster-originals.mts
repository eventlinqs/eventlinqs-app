/**
 * THE FOUR ORIGINALS RE-MADE FROM TEST DATA (the daily poster directive's acceptance), side by side with the
 * originals at 390 px. Each night is read through the planner's own read (readCampaignNights: its facts, its admission,
 * the register's answer on its image), made into its poster piece by the planner's own builder (dailyPosterPieces), and
 * drawn by the campaign renderer at the feed portrait the originals are. Read only on TEST; draws into <out dir>.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/daily-poster-originals.mts <out dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import type * as StoreModule from '@/lib/social/store'
import type * as PostersModule from '@/lib/social/daily-posters'
import type * as SlidesModule from '@/lib/broadcast/campaign-slides'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) => (request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest))
const pick = <T,>(mod: T & { default?: T }) => (mod.default ?? mod) as T
const store = pick((await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule })
const posters = pick((await import('@/lib/social/daily-posters')) as typeof PostersModule & { default?: typeof PostersModule })
const slides = pick((await import('@/lib/broadcast/campaign-slides')) as typeof SlidesModule & { default?: typeof SlidesModule })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error(`TEST only, refused: ${url}`)
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
const out = process.argv[2] ?? 'daily-poster-originals'
mkdirSync(out, { recursive: true })

const SLUGS = ['creative-community-night-w3-poster-fixture', 'jackpot-trivia-w3-poster-fixture', 'friyay-at-beavs-w3-poster-fixture', 'wooshka-live-w3-poster-fixture']
const { data: rows, error } = await db.from('events').select('id, slug').in('slug', SLUGS)
if (error) throw error
const idOf = new Map((rows ?? []).map((r) => [r.slug as string, r.id as string]))

const weekStart = '2026-11-02'
const now = new Date('2026-11-02T01:00:00Z')
const cities = await store.readCampaignCities(db)
const nights = await store.readCampaignNights(db, cities, weekStart, now)
const phones: Buffer[] = []
for (const slug of SLUGS) {
  const n = nights.find((x) => x.eventId === idOf.get(slug))
  if (!n) throw new Error(`${slug} is not among the week's nights as the planner reads them`)
  const [piece] = posters.dailyPosterPieces({ nights: [n], cities, weekStart, origin: 'https://www.eventlinqs.com.au' })
  if (!piece) throw new Error(`${slug}: no poster piece was made`)
  const slide = piece.slides[0]
  const bytes = await slides.renderCampaignSlide('feed', slide, 1, 1, null, null)
  writeFileSync(join(out, `${slug}-portrait.jpg`), bytes)
  const phone = await sharp(Buffer.from(bytes)).resize({ width: 390 }).png().toBuffer()
  writeFileSync(join(out, `${slug}-portrait-phone-390.png`), phone)
  phones.push(phone)
  console.log(`${slug}: ${piece.mode}, ${piece.picks[0]?.reason}`)
}

// The originals above, ours below, both at 390 wide each.
const ref = 'C:/dev/START-16OCT/DAILY-POSTER-REFERENCE-4-ORIGINALS.png'
const crops = [[72, 410], [609, 410], [1146, 410], [1683, 410]] as const
const originals = await Promise.all(crops.map(([left, top]) => sharp(ref).extract({ left, top, width: 500, height: 625 }).resize({ width: 390 }).png().toBuffer()))
const gap = 24
const oursH = (await sharp(phones[0]).metadata()).height ?? 488
const origH = (await sharp(originals[0]).metadata()).height ?? 488
await sharp({ create: { width: 4 * 390 + 5 * gap, height: origH + oursH + 3 * gap, channels: 3, background: '#EDEAE4' } })
  .composite([
    ...originals.map((input, i) => ({ input, left: gap + i * (390 + gap), top: gap })),
    ...phones.map((input, i) => ({ input, left: gap + i * (390 + gap), top: 2 * gap + origH })),
  ])
  .png()
  .toFile(join(out, 'originals-above-ours-below-390.png'))
console.log(`4 posters from TEST data, and the side by side, in ${out}`)
