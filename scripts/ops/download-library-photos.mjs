/**
 * DOWNLOAD ONCE, KEEP FOR GOOD (the project manager's 22:24 of 29 October 2026, under Lawal's 22:23: every tile on a
 * stored photograph, never a request-time Pexels call). For each tile Lawal's own photographs and the bundled
 * originals do not cover, this fetches the photograph the tile showed before tonight (the same query, filter, pool and
 * pick the live code used), or for a tile that never had one a fitting photograph, and keeps it in
 * public/images/library/<slug>.jpg with its photographer, its page and its licence in
 * public/images/library/attribution.json. The tiles then point at the kept copy; nothing asks Pexels for a tile again.
 *
 *   node --env-file=<an env file holding PEXELS_API_KEY> scripts/ops/download-library-photos.mjs
 *
 * Idempotent: a slug whose file and attribution already exist is left alone. The key is read from the environment and
 * never printed. Licence: the Pexels License (https://www.pexels.com/license/), free to use, attribution not required;
 * we record it anyway.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const KEY = process.env.PEXELS_API_KEY
if (!KEY) throw new Error('PEXELS_API_KEY is not set')
const DIR = 'public/images/library'
const ATTRIBUTION = join(DIR, 'attribution.json')
mkdirSync(DIR, { recursive: true })

const hash = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/*
 * pick 'community': community-photo.ts (per_page 15, at least 1600 x 900, the top 5, hash(query + ':community-hero')).
 * pick 'category': category-photo.ts with no seed (per_page 24, at least 1200 x 800, the top 10, hash(query)).
 * before: true where the live code held this query, so the kept photograph is the one the tile showed.
 */
const WANTED = [
  { slug: 'korean', pick: 'community', before: true, query: 'korean festival hanbok traditional celebration community' },
  { slug: 'japanese', pick: 'community', before: true, query: 'japanese matsuri festival lanterns traditional celebration' },
  { slug: 'greek', pick: 'community', before: true, query: 'greek festival traditional dance celebration food' },
  { slug: 'lebanese-levantine', pick: 'community', before: true, query: 'lebanese dabke dance celebration feast colourful' },
  { slug: 'persian-iranian', pick: 'community', before: false, query: 'nowruz persian new year celebration family table' },
  { slug: 'turkish', pick: 'community', before: false, query: 'turkish festival traditional dance celebration' },
  { slug: 'arab', pick: 'community', before: false, query: 'arabic music oud performance celebration' },
  { slug: 'maori', pick: 'community', before: false, query: 'maori kapa haka performance' },
  { slug: 'other-east-southeast-asian', pick: 'community', before: false, query: 'southeast asian night market lanterns crowd' },
  { slug: 'other-european', pick: 'community', before: false, query: 'european folk festival outdoor dance celebration' },
  { slug: 'health-wellness', pick: 'category', before: true, query: 'yoga wellness meditation outdoor sunrise' },
  { slug: 'fashion', pick: 'category', before: true, query: 'fashion runway show models lights' },
  { slug: 'film', pick: 'category', before: true, query: 'cinema premiere red carpet audience' },
  { slug: 'charity', pick: 'category', before: true, query: 'charity volunteers fundraiser smiling helping' },
  { slug: 'education', pick: 'category', before: true, query: 'lecture seminar audience speaker classroom' },
  { slug: 'technology', pick: 'category', before: true, query: 'tech conference startup speakers stage' },
  { slug: 'middle-eastern', pick: 'category', before: true, query: 'middle eastern feast long table lanterns celebration' },
  // The sub-community tiles the community pages draw that asked Pexels (sub-community-photo.ts): 15 of 105.
  { slug: 'sub-african-afrobeats', pick: 'sub', before: true, query: 'african music concert dancing crowd vibrant' },
  { slug: 'sub-african-amapiano', pick: 'sub', before: true, query: 'south african dance music party youth' },
  { slug: 'sub-african-owambe', pick: 'sub', before: true, query: 'nigerian wedding aso ebi colorful gele celebration' },
  { slug: 'sub-african-west-african', pick: 'sub', before: true, query: 'west african drum dance traditional dress' },
  { slug: 'sub-african-east-african', pick: 'sub', before: true, query: 'east african celebration colorful traditional' },
  { slug: 'sub-caribbean-soca', pick: 'sub', before: true, query: 'soca caribbean carnival feathers dancing' },
  { slug: 'sub-caribbean-dancehall', pick: 'sub', before: true, query: 'dancehall jamaica music party celebration' },
  // The reggae tile's old pick was a person in a Guy Fawkes mask, a protest image rather than reggae: replaced by a fitting one.
  { slug: 'sub-caribbean-reggae', pick: 'sub', before: false, query: 'reggae band live stage concert' },
  { slug: 'sub-caribbean-trinidadian', pick: 'sub', before: true, query: 'trinidad carnival mas costume celebration' },
  { slug: 'sub-caribbean-jamaican', pick: 'sub', before: true, query: 'jamaica beach music celebration tropical' },
  { slug: 'sub-caribbean-afro-caribbean', pick: 'sub', before: true, query: 'afro caribbean drumming celebration colorful' },
  { slug: 'sub-filipino-opm', pick: 'sub', before: true, query: 'filipino music concert manila celebration' },
  { slug: 'sub-filipino-fiesta', pick: 'sub', before: true, query: 'filipino fiesta parol traditional colorful' },
  { slug: 'sub-filipino-sinulog', pick: 'sub', before: true, query: 'sinulog cebu festival dance colorful' },
  { slug: 'sub-filipino-modern-filipino', pick: 'sub', before: true, query: 'filipino modern music youth celebration' },
  // The city tiles (portrait) and city heroes (landscape) for every city Lawal's spine does not hold (city-photo.ts).
  { slug: 'city-townsville', pick: 'city', before: true, query: 'townsville magnetic island tropical' },
  { slug: 'city-hero-townsville', pick: 'city-hero', before: true, query: 'townsville magnetic island tropical' },
  { slug: 'city-sunshine-coast', pick: 'city', before: true, query: 'sunshine coast beach hinterland' },
  { slug: 'city-hero-sunshine-coast', pick: 'city-hero', before: true, query: 'sunshine coast beach hinterland' },
  { slug: 'city-bendigo', pick: 'city', before: true, query: 'bendigo heritage architecture city' },
  { slug: 'city-hero-bendigo', pick: 'city-hero', before: true, query: 'bendigo heritage architecture city' },
  { slug: 'city-ballarat', pick: 'city', before: true, query: 'ballarat heritage gold rush architecture' },
  { slug: 'city-hero-ballarat', pick: 'city-hero', before: true, query: 'ballarat heritage gold rush architecture' },
  { slug: 'city-albury', pick: 'city', before: true, query: 'albury murray river city' },
  { slug: 'city-hero-albury', pick: 'city-hero', before: true, query: 'albury murray river city' },
  { slug: 'city-launceston', pick: 'city', before: true, query: 'launceston tasmania heritage city' },
  { slug: 'city-hero-launceston', pick: 'city-hero', before: true, query: 'launceston tasmania heritage city' },
  { slug: 'city-toowoomba', pick: 'city', before: true, query: 'toowoomba garden city heritage' },
  { slug: 'city-hero-toowoomba', pick: 'city-hero', before: true, query: 'toowoomba garden city heritage' },
  { slug: 'city-auckland', pick: 'city', before: true, query: 'auckland new zealand harbour skyline' },
  { slug: 'city-hero-auckland', pick: 'city-hero', before: true, query: 'auckland new zealand harbour skyline' },
  { slug: 'city-london', pick: 'city', before: true, query: 'london england skyline big ben' },
  { slug: 'city-hero-london', pick: 'city-hero', before: true, query: 'london england skyline big ben' },
  { slug: 'city-manchester', pick: 'city', before: true, query: 'manchester england city skyline' },
  { slug: 'city-hero-manchester', pick: 'city-hero', before: true, query: 'manchester england city skyline' },
  { slug: 'city-birmingham', pick: 'city', before: true, query: 'birmingham england city skyline' },
  { slug: 'city-hero-birmingham', pick: 'city-hero', before: true, query: 'birmingham england city skyline' },
  { slug: 'city-dublin', pick: 'city', before: true, query: 'dublin ireland city' },
  { slug: 'city-hero-dublin', pick: 'city-hero', before: true, query: 'dublin ireland city' },
  { slug: 'city-toronto', pick: 'city', before: true, query: 'toronto canada skyline cn tower' },
  { slug: 'city-hero-toronto', pick: 'city-hero', before: true, query: 'toronto canada skyline cn tower' },
  { slug: 'city-montreal', pick: 'city', before: true, query: 'montreal canada skyline night' },
  { slug: 'city-hero-montreal', pick: 'city-hero', before: true, query: 'montreal canada skyline night' },
  { slug: 'city-new-york', pick: 'city', before: true, query: 'new york manhattan skyline' },
  { slug: 'city-hero-new-york', pick: 'city-hero', before: true, query: 'new york manhattan skyline' },
  { slug: 'city-washington-dc', pick: 'city', before: true, query: 'washington dc capitol skyline' },
  { slug: 'city-hero-washington-dc', pick: 'city-hero', before: true, query: 'washington dc capitol skyline' },
  { slug: 'city-houston', pick: 'city', before: true, query: 'houston texas skyline' },
  { slug: 'city-hero-houston', pick: 'city-hero', before: true, query: 'houston texas skyline' },
  { slug: 'city-atlanta', pick: 'city', before: true, query: 'atlanta georgia skyline' },
  { slug: 'city-hero-atlanta', pick: 'city-hero', before: true, query: 'atlanta georgia skyline' },
  { slug: 'city-miami', pick: 'city', before: true, query: 'miami florida skyline beach' },
  { slug: 'city-hero-miami', pick: 'city-hero', before: true, query: 'miami florida skyline beach' },
  { slug: 'city-los-angeles', pick: 'city', before: true, query: 'los angeles california skyline' },
  { slug: 'city-hero-los-angeles', pick: 'city-hero', before: true, query: 'los angeles california skyline' },
  { slug: 'city-lagos', pick: 'city', before: true, query: 'lagos nigeria victoria island skyline' },
  { slug: 'city-hero-lagos', pick: 'city-hero', before: true, query: 'lagos nigeria victoria island skyline' },
  { slug: 'city-accra', pick: 'city', before: true, query: 'accra ghana city' },
  { slug: 'city-hero-accra', pick: 'city-hero', before: true, query: 'accra ghana city' },
]

const kept = existsSync(ATTRIBUTION) ? JSON.parse(readFileSync(ATTRIBUTION, 'utf8')) : { licence: 'Pexels License, https://www.pexels.com/license/', photos: {} }
let fetched = 0
for (const w of WANTED) {
  const file = join(DIR, `${w.slug}.jpg`)
  if (existsSync(file) && kept.photos[w.slug]) { console.log(`kept      ${w.slug}`); continue }
  const perPage = w.pick === 'category' ? 24 : 15
  const orientation = w.pick === 'city' ? 'portrait' : 'landscape'
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(w.query)}&per_page=${perPage}&orientation=${orientation}&size=large`, { headers: { Authorization: KEY } })
  if (!res.ok) throw new Error(`Pexels answered ${res.status} for ${w.slug}; nothing kept for it`)
  const photos = (await res.json()).photos ?? []
  if (photos.length === 0) throw new Error(`no photograph for ${w.slug}`)
  // pick 'sub': sub-community-photo.ts (per_page 15, at least 1200 x 700, the top 5, hash(query + ':sub-community')).
  // pick 'city': city-photo.ts getCityPhoto (portrait, per_page 15, at least 800 x 1200, the top 5, hash(query)).
  // pick 'city-hero': getCityHeroPhoto (landscape, per_page 15, at least 1600 x 900, the top 5, hash(query + ':landscape')).
  const [minW, minH, top, seed] =
    w.pick === 'community' ? [1600, 900, 5, `${w.query}:community-hero`] : w.pick === 'sub' ? [1200, 700, 5, `${w.query}:sub-community`] : w.pick === 'city' ? [800, 1200, 5, w.query] : w.pick === 'city-hero' ? [1600, 900, 5, `${w.query}:landscape`] : [1200, 800, 10, w.query]
  const usable = photos.filter((p) => (p.width ?? 0) >= minW && (p.height ?? 0) >= minH)
  const pool = (usable.length > 0 ? usable : photos).slice(0, top)
  const photo = pool[hash(seed) % pool.length]
  const bytes = Buffer.from(await (await fetch(photo.src.original)).arrayBuffer())
  await sharp(bytes).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(file)
  kept.photos[w.slug] = {
    file: `/images/library/${w.slug}.jpg`,
    photographer: photo.photographer,
    photographer_url: photo.photographer_url,
    page: photo.url,
    pexels_id: photo.id,
    alt: photo.alt || w.slug,
    query: w.query,
    shown_before_tonight: w.before,
    downloaded_on: '2026-10-29',
  }
  // Recorded as each one is kept, so a run cut short (a 429 at 23:28 on 29 October 2026) never leaves a file without
  // its photographer and licence on record.
  writeFileSync(ATTRIBUTION, `${JSON.stringify(kept, null, 2)}\n`)
  fetched += 1
  console.log(`fetched   ${w.slug}: ${photo.photographer}, ${photo.url}`)
}
writeFileSync(ATTRIBUTION, `${JSON.stringify(kept, null, 2)}\n`)
console.log(`${fetched} photograph(s) fetched, ${Object.keys(kept.photos).length} on record in ${ATTRIBUTION}`)
