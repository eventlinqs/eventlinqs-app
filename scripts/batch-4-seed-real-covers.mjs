#!/usr/bin/env node
// Batch 4: backfill unique organiser-style covers for every dev seed event.
//
// Why: previous projection collided picsum URLs to a single Pexels category
// photo per category, so 3-of-4 cards on /events/browse/sydney showed the
// same image. The structural fix removes that collision; this script
// replaces each seed event's picsum cover with a unique community-relevant
// Pexels image so the dev catalogue actually exercises the new path.
//
// Production hardening lives in 20260504000001_event_photo_required.sql
// (CHECK constraint disallows picsum.photos for published events).
//
// Usage:
//   node scripts/batch-4-seed-real-covers.mjs

import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import fs from 'node:fs/promises'

// Minimal .env.local loader so we don't take a runtime dep on dotenv.
const envText = await fs.readFile('.env.local', 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
  if (!m) continue
  let value = m[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!process.env[m[1]]) process.env[m[1]] = value
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const PEXELS_KEY = process.env.PEXELS_API_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!PEXELS_KEY) {
  console.error('Missing PEXELS_API_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const CATEGORY_QUERIES = {
  'afrobeats':                 'african music concert dancing crowd vibrant',
  'caribbean':                 'caribbean carnival dance steel drum tropical',
  'bollywood':                 'indian wedding dance saree colorful celebration',
  'latin':                     'latin dance salsa club music vibrant',
  'italian':                   'italian festival pasta wine celebration warm',
  'filipino':                  'filipino fiesta celebration parol traditional',
  'lunar':                     'lunar new year red lanterns dragon celebration',
  'gospel':                    'gospel choir worship raised hands joy',
  'amapiano':                  'south african dance music party youth',
  'comedy':                    'comedy club stage microphone audience laughing',
  'owambe':                    'nigerian wedding celebration colorful attire',
  'music':                     'live music concert audience stage',
  'sports':                    'stadium fans cheering',
  'arts-community':              'art gallery exhibition community',
  'food-drink':                'food festival tasting outdoor',
  'family':                    'family festival outdoor',
  'fashion':                   'fashion runway show models',
  'health-wellness':           'yoga wellness meditation',
  'religion':                  'congregation worship ceremony',
  'community':                 'community gathering outdoor',
  'charity':                   'charity volunteers fundraiser',
  'education':                 'lecture seminar audience',
  'festival':                  'music festival crowd lights',
  'nightlife':                 'nightclub friends celebration lights',
  'technology':                'tech conference speakers',
  'other':                     'community celebration event',
}

function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const PEXELS_API = 'https://api.pexels.com/v1'

const photoCache = new Map()

async function searchPexels(query) {
  if (photoCache.has(query)) return photoCache.get(query)
  const url = `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape&size=large`
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } })
  if (!res.ok) {
    console.error(`Pexels HTTP ${res.status} for query "${query}"`)
    photoCache.set(query, [])
    return []
  }
  const data = await res.json()
  const photos = (data.photos ?? [])
    .filter(p => (p.width ?? 0) >= 1200 && (p.height ?? 0) >= 800)
    .map(p => ({
      src: p.src.large || p.src.landscape || p.src.medium,
      thumb: p.src.medium,
      alt: p.alt || query,
    }))
  photoCache.set(query, photos)
  return photos
}

async function _pickPhotoForEvent(slug, categorySlug) {
  const query = CATEGORY_QUERIES[categorySlug] ?? CATEGORY_QUERIES['other']
  const pool = await searchPexels(query)
  if (pool.length === 0) return null
  const idx = hash32(slug) % pool.length
  return pool[idx]
}

async function main() {
  console.log('Fetching events with picsum or null covers...')
  const { data: events, error } = await supabase
    .from('events')
    .select('id, slug, cover_image_url, category:event_categories(slug)')
    .or('cover_image_url.is.null,cover_image_url.ilike.https://picsum.photos/%')
  if (error) {
    console.error(error)
    process.exit(1)
  }
  console.log(`Need to update ${events.length} events`)

  const updated = []
  const failed = []
  // Group by category to maximise pool reuse and avoid intra-category duplicates.
  const byCategory = new Map()
  for (const e of events) {
    const slug = e.category?.slug ?? 'other'
    if (!byCategory.has(slug)) byCategory.set(slug, [])
    byCategory.get(slug).push(e)
  }

  for (const [catSlug, catEvents] of byCategory.entries()) {
    const query = CATEGORY_QUERIES[catSlug] ?? CATEGORY_QUERIES['other']
    const pool = await searchPexels(query)
    if (pool.length === 0) {
      console.error(`No Pexels pool for category ${catSlug}`)
      catEvents.forEach(e => failed.push(e.slug))
      continue
    }
    // Distribute uniquely within the category by ranking events by hash and
    // walking the pool. This guarantees no two events in the same category
    // share an image until the pool is exhausted.
    const ranked = [...catEvents].sort(
      (a, b) => hash32(a.slug) - hash32(b.slug),
    )
    for (let i = 0; i < ranked.length; i++) {
      const e = ranked[i]
      const photo = pool[i % pool.length]
      const { error: updateErr } = await supabase
        .from('events')
        .update({
          cover_image_url: photo.src,
          thumbnail_url: photo.thumb,
        })
        .eq('id', e.id)
      if (updateErr) {
        console.error(`update failed for ${e.slug}:`, updateErr.message)
        failed.push(e.slug)
      } else {
        updated.push({ slug: e.slug, category: catSlug, src: photo.src })
        console.log(`OK  ${catSlug.padEnd(20)} ${e.slug.slice(0, 50)}`)
      }
    }
  }

  console.log(`\nDone. Updated ${updated.length} / ${events.length}. Failed ${failed.length}.`)
  const outDir = path.join(process.cwd(), 'docs', 'redesign', 'batch-4-evidence', 'diagnosis')
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(
    path.join(outDir, 'cover-backfill.json'),
    JSON.stringify({ when: new Date().toISOString(), updated, failed }, null, 2),
  )
  console.log(`Report -> ${path.join(outDir, 'cover-backfill.json')}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
