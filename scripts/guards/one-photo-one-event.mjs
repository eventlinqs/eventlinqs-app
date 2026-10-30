/**
 * GUARD: ONE PHOTO, ONE EVENT (the photo system, P1 and P2, binding from
 * Lawal's ruling of 31 October 2026 00:14: "Every photo is unique to a
 * particular event." C:\dev\START-16OCT\EVENTLINQS-PHOTO-SYSTEM-31OCT.md).
 *
 * WHY. On 31 October Lawal saw the same photo on different cards in different
 * sections of the live site. The card chain picked a photo at render time, so
 * nothing anywhere could say a photo was already somebody else's. The photo
 * system moves that decision into one record per photo (window 3's
 * 20261031010001_photo_assignments), and this guard is the gate's half of its
 * proof (proof 1 in the document): it fails any car in which a photo can be, or
 * is, assigned to two events.
 *
 * WHAT IT JUDGES, four clauses, each printed on every run:
 *
 *   A. THE SCHEMA (P2, read from supabase/migrations, no network). Some
 *      migration creates public.photo_assignments; photo_sha256 is NOT NULL and
 *      UNIQUE on its own (a column constraint, a table constraint, a later
 *      ADD CONSTRAINT or a CREATE UNIQUE INDEX on that one column; never on the
 *      hash together with the night, which lets one photo onto two nights), and
 *      no later migration drops that rule; photo_dhash exists; event_id exists;
 *      and a migration refuses a near copy with bit_count(... photo_dhash # ...)
 *      <= N. N is READ from that migration, so the database's line and this
 *      guard's line cannot drift apart.
 *
 *   B. THE ROWS (P1, read through the shared door, read only). Every row of
 *      photo_assignments on the database the environment names. No sha256
 *      twice (the index makes this impossible; it is read anyway, because an
 *      index can be dropped by hand), and no two rows held by DIFFERENT nights
 *      or series whose difference hashes are within N bits, which is how a
 *      resized or re-encoded copy of one photo shows itself. photo_dhash is a
 *      signed bigint, read as text: as a JSON number it would be rounded past
 *      2^53 and two different photos could look alike.
 *
 * NOT BUILT IS A FAILURE. Until a migration creates the table, clause A fails
 * and says so. That was the truth about the platform when this was written,
 * which is why the guard is registered in run-guards.mjs in the same car as the
 * assignment table, and run by C:\dev\STACK-CHECK.sh before that.
 *
 *   C. THE RENDER PATHS (P2, read from src, no network). The night's photo is
 *      read by one module only and the card chain reads it; no public page
 *      reads the venue library or the photo tables itself. See READER below.
 *
 *   D. VIDEOS (P10, one video, one event). A trigger before insert or update
 *      of video_url on public.events stands at the end of the migrations, and
 *      no link (trimmed, any case) is held by two events outside one series.
 *
 * NOT JUDGED HERE, said so that nobody reads a PASS as more than it is: the
 * live crawl (proof 2), which is window 6's script and reads production pages,
 * and whether every upload path calls window 3's lock (P9), which its own tests
 * prove.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { selectRest, couldNotLook } from './lib/db-read.mjs'
import { readSource, sourceFiles } from './lib/source.mjs'
import { tableReadCredential } from './lib/table-read-credential.mjs'

const TAG = '[one-photo-one-event]'

export const TABLE = 'photo_assignments'
export const HASH = 'photo_sha256'
export const DHASH = 'photo_dhash'
export const EVENT = 'event_id'
export const SERIES = 'listing_series_id'
export const MIGRATIONS = 'supabase/migrations'

const SQL_COMMENT = /--[^\n]*|\/\*[\s\S]*?\*\//g
const MASK64 = (1n << 64n) - 1n

/** The migrations in the order they apply. judgeSchema removes comments and lower-cases. */
export function readMigrations(dir = MIGRATIONS) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(dir, f), 'utf8') }))
}

/** The body between the parentheses that open at `open`, or null. */
function parenthesised(sql, open) {
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')' && --depth === 0) return sql.slice(open + 1, i)
  }
  return null
}

/** Split a table body on its top-level commas. */
function topLevel(body) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++
    else if (body[i] === ')') depth--
    else if (body[i] === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(body.slice(start).trim())
  return parts
}

/**
 * Clause A. Returns { built, faults: string[], where, holds, bits } from the migrations.
 * @param {{ file: string, sql: string }[]} given
 */
export function judgeSchema(given) {
  const migrations = given.map((m) => ({ file: m.file, sql: m.sql.replace(SQL_COMMENT, ' ').toLowerCase() }))
  const create = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${TABLE}\\s*\\(`)
  const made = migrations.find((m) => create.test(m.sql))
  if (!made) {
    return {
      built: false,
      faults: [`no migration in ${MIGRATIONS} creates public.${TABLE}: P1 and P2 are NOT BUILT, so nothing stops one photo being shown for two events`],
    }
  }
  const faults = []
  const at = made.sql.search(create)
  const body = parenthesised(made.sql, made.sql.indexOf('(', at)) ?? ''
  const parts = topLevel(body)
  const column = (name) => parts.find((p) => new RegExp(`^"?${name}"?\\s`).test(p))

  const hash = column(HASH)
  if (!hash) faults.push(`${made.file}: public.${TABLE} has no ${HASH} column`)
  else if (!/\bnot\s+null\b|\bprimary\s+key\b/.test(hash)) faults.push(`${made.file}: ${HASH} may be null, and a null hash is never equal to another, so the unique rule would not hold for it`)
  if (!column(DHASH)) faults.push(`${made.file}: public.${TABLE} has no ${DHASH} column, so a resized or re-encoded copy cannot be found`)
  if (!column(EVENT)) faults.push(`${made.file}: public.${TABLE} has no ${EVENT} column, so no assignment says whose photo it is`)

  /* Uniqueness on the hash ALONE: (photo_sha256, event_id) would allow the same photo on two events. */
  const alone = new RegExp(`unique\\s*(?:nulls\\s+not\\s+distinct\\s*)?\\(\\s*"?${HASH}"?\\s*\\)|primary\\s+key\\s*\\(\\s*"?${HASH}"?\\s*\\)`)
  const indexAlone = new RegExp(
    `create\\s+unique\\s+index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?("?[a-z0-9_]+"?)\\s+on\\s+(?:only\\s+)?(?:public\\.)?${TABLE}\\s*(?:using\\s+btree\\s*)?\\(\\s*"?${HASH}"?\\s*\\)\\s*(where\\b)?`,
    'g',
  )
  const constraintAlone = new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?${TABLE}\\s+add\\s+constraint\\s+("?[a-z0-9_]+"?)\\s+(?:unique|primary\\s+key)\\s*\\(\\s*"?${HASH}"?\\s*\\)`,
    'g',
  )
  /** Each way the rule is made, with the name a later migration would drop it by. */
  const holds = []
  if (hash && /\bunique\b|\bprimary\s+key\b/.test(hash)) holds.push({ file: made.file, name: null })
  for (const p of parts) if (/^(constraint\s+\S+\s+)?(unique|primary\s+key)\b/.test(p) && alone.test(p)) holds.push({ file: made.file, name: (p.match(/^constraint\s+("?[a-z0-9_]+"?)/) ?? [])[1] ?? null })
  for (const m of migrations) {
    for (const x of m.sql.matchAll(indexAlone)) {
      /* A partial unique index (WHERE retired_at is null) lets a retired photo be dealt again, which P1 forbids. */
      if (x[2]) faults.push(`${m.file}: the unique index ${x[1]} on ${HASH} is partial, so a photo outside its WHERE can be assigned again`)
      else holds.push({ file: m.file, name: x[1].replace(/"/g, '') })
    }
    for (const x of m.sql.matchAll(constraintAlone)) holds.push({ file: m.file, name: x[1].replace(/"/g, '') })
  }
  /* A rule a later migration drops does not hold. An unnamed column constraint is dropped by its default name. */
  const dropped = (h) => {
    const name = h.name ?? `${TABLE}_${HASH}_key`
    return migrations.some((m) => m.file >= h.file && new RegExp(`drop\\s+(?:index|constraint)\\s+(?:concurrently\\s+)?(?:if\\s+exists\\s+)?(?:public\\.)?"?${name}"?\\b`).test(m.sql))
  }
  const live = holds.filter((h) => !dropped(h))
  if (hash && live.length === 0) {
    faults.push(
      holds.length
        ? `${HASH} was made unique and a later migration drops it (${holds.map((h) => h.name ?? 'the column constraint').join(', ')}), so the database no longer refuses a second assignment`
        : `${made.file}: ${HASH} is not unique on its own, so the database accepts the same photo for a second event`,
    )
  }

  /* The near-copy line, as the database draws it. The newest migration that draws one wins. */
  const line = new RegExp(`bit_count\\(\\s*\\(?[^;]*?${DHASH}\\s*#[^;]*?\\)\\s*<=\\s*(\\d+)`)
  let bits = null
  for (const m of migrations) {
    const x = m.sql.match(line)
    if (x) bits = Number(x[1])
  }
  if (bits === null) faults.push(`no migration refuses a near copy (bit_count(... ${DHASH} # ...) <= N), so a resized copy of a photo can be assigned to a second event`)
  return { built: true, faults, where: made.file, holds: live.length, bits }
}

/*
 * Clause C, the render paths (P2: "nothing picks a photo at render time"). Window 3's 31 October 00:36: the ONE
 * reader of a night's assigned photo is public.event_cover_photos_for, called only by eventCoversFor in READER,
 * called only by withVenuePhotos in CHAIN, through which every card loader and event page passes its rows. The venue
 * library read (venue_photos_for and its wrappers) is the photo a VENUE holds, not the one a night was dealt, so a
 * public page that reads it is picking a photo outside the assignment. Managing a library (the organiser's media page,
 * the admin approval screen) may read it.
 */
export const READER = 'src/lib/venues/venue-photos-read.ts'
export const CHAIN = 'src/lib/images/venue-photo-chain.ts'
export const MANAGE = ['src/lib/venues/venue-images.ts', 'src/app/(dashboard)/', 'src/app/admin/', 'src/lib/admin/']
const GENERATED = 'src/types/database.ts'
const LIBRARY_READS = /\b(venuePhotosFor|venuePhotoFor|shownVenuePhoto)\b/
const TABLE_READS = /\.from\(\s*['"`](venue_images|photo_assignments)['"`]\s*\)/

/**
 * @param {{ path: string, withStrings: string, code: string }[]} files  comments blanked (withStrings) and strings
 *   blanked too (code), as readSource gives them
 * @returns {{ faults: string[], readers: number }}
 */
export function judgeRenderPaths(files) {
  const faults = []
  const managing = (p) => MANAGE.some((m) => (m.endsWith('/') ? p.startsWith(m) : p === m))
  const reader = files.find((f) => f.path === READER)
  const chain = files.find((f) => f.path === CHAIN)
  if (!reader || !/['"`]event_cover_photos_for['"`]/.test(reader.withStrings)) {
    faults.push(`${READER} does not call event_cover_photos_for, so no card reads its night's assigned photo`)
  }
  if (!chain || !/\beventCoversFor\b/.test(chain.code)) faults.push(`${CHAIN} does not read eventCoversFor, so the card chain does not read the assignment`)
  for (const f of files) {
    if (f.path === READER || f.path === GENERATED) continue
    const rpc = f.withStrings.match(/['"`](event_cover_photos_for|venue_photos_for)['"`]/)
    if (rpc) faults.push(`${f.path} calls ${rpc[1]} itself; only ${READER} reads photos from the database`)
    if (managing(f.path)) continue
    const lib = f.code.match(LIBRARY_READS)
    if (lib) faults.push(`${f.path} reads the venue library (${lib[1]}), a photo the venue holds and no night was dealt`)
    const table = f.withStrings.match(TABLE_READS)
    if (table && f.path !== READER) faults.push(`${f.path} reads ${table[1]} directly; a page shows a photo only through ${CHAIN}`)
  }
  return { faults, readers: files.filter((f) => f.code.includes('withVenuePhotos')).length }
}

/** A signed 64-bit bigint, as the text Postgres writes, to its unsigned bits; null when it is not one. */
export function dhashBits(v) {
  if (typeof v !== 'string' || !/^-?\d{1,20}$/.test(v)) return null
  const n = BigInt(v)
  if (n < -(1n << 63n) || n >= 1n << 63n) return null
  return n & MASK64
}

/** Bits that differ between two difference hashes, given as Postgres bigint text; null when either is not one. */
export function hamming(a, b) {
  const x = dhashBits(a)
  const y = dhashBits(b)
  if (x === null || y === null) return null
  let d = x ^ y
  let bits = 0
  while (d) {
    bits += Number(d & 1n)
    d >>= 1n
  }
  return bits
}

/** Whose photo a row is: its night, else its series, else (a deleted target) the row alone. */
function holderOf(r, i) {
  if (r[EVENT]) return `night ${r[EVENT]}`
  if (r[SERIES]) return `series ${r[SERIES]}`
  return `a deleted target (row ${i + 1})`
}

/**
 * Clause B. Rows are { photo_sha256, photo_dhash (bigint text or null), event_id, listing_series_id }.
 * A row with no dhash is counted: the table allows it, and it can only be judged by its bytes.
 * @returns {{ twice: string[], near: string[], unhashed: number }}
 */
export function judgeAssignments(rows, threshold) {
  const twice = []
  const near = []
  const byHash = new Map()
  rows.forEach((r, i) => {
    const seen = byHash.get(r[HASH])
    if (seen !== undefined) twice.push(`${HASH} ${String(r[HASH]).slice(0, 12)} is assigned twice (${seen} and ${holderOf(r, i)})`)
    else byHash.set(r[HASH], holderOf(r, i))
  })
  const hashed = []
  let unhashed = 0
  rows.forEach((r, i) => (dhashBits(r[DHASH]) === null ? unhashed++ : hashed.push({ r, holder: holderOf(r, i) })))
  for (let i = 0; i < hashed.length; i++) {
    for (let j = i + 1; j < hashed.length; j++) {
      const a = hashed[i]
      const b = hashed[j]
      if (a.holder === b.holder) continue
      const d = hamming(a.r[DHASH], b.r[DHASH])
      if (d !== null && d <= threshold) near.push(`one photo on two events: ${a.holder} and ${b.holder} hold photos ${d} bit(s) apart, within ${threshold}`)
    }
  }
  return { twice, near, unhashed }
}

/*
 * Clause D, videos (P10: one video, one event). A video is a link on the event (events.video_url), so the rule
 * lives in a trigger on public.events: window 3's events_one_video_per_event refuses the same link, trimmed and in
 * any case, on another event outside the same series. The schema half asks that some trigger fires before insert or
 * update of video_url on public.events and is not dropped afterwards; the rows half reads every event holding a link.
 */
const VIDEO_TRIGGER = /create\s+(?:or\s+replace\s+)?trigger\s+("?[a-z0-9_]+"?)\s+before\s+insert\s+or\s+update\s+of\s+[^;]*\bvideo_url\b[^;]*\bon\s+(?:public\.)?events\b/g

/** @param {{ file: string, sql: string }[]} given  @returns {{ faults: string[], trigger: string | null }} */
export function judgeVideoSchema(given) {
  const migrations = given.map((m) => ({ file: m.file, sql: m.sql.replace(SQL_COMMENT, ' ').toLowerCase() }))
  /* Statement order across files decides: a create later dropped by name, and not created again, does not hold. */
  const standing = new Map()
  for (const m of migrations) {
    const events = []
    for (const x of m.sql.matchAll(VIDEO_TRIGGER)) events.push({ at: x.index, name: x[1].replace(/"/g, ''), on: true })
    for (const x of m.sql.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?("?[a-z0-9_]+"?)\s+on\s+(?:public\.)?events\b/g)) {
      events.push({ at: x.index, name: x[1].replace(/"/g, ''), on: false })
    }
    for (const e of events.sort((a, b) => a.at - b.at)) standing.set(e.name, e.on ? m.file : null)
  }
  const live = [...standing].find(([, file]) => file)
  return live
    ? { faults: [], trigger: live[0] }
    : { faults: ['no trigger on public.events refuses a video link already on another event, so one video can be shown for two events (P10)'], trigger: null }
}

/**
 * Rows are { id, video_url, listing_series_id }. One link (trimmed, any case) held by two events of different
 * series, or by two events of no series, is one video on two events.
 * @returns {string[]}
 */
export function judgeVideos(rows) {
  const byLink = new Map()
  for (const r of rows) {
    const link = typeof r.video_url === 'string' ? r.video_url.trim().toLowerCase() : ''
    if (!link) continue
    const holder = r.listing_series_id ? `series ${r.listing_series_id}` : `event ${r.id}`
    const held = byLink.get(link) ?? new Set()
    held.add(holder)
    byLink.set(link, held)
  }
  return [...byLink].filter(([, held]) => held.size > 1).map(([link, held]) => `one video on ${held.size} events: ${link.slice(0, 80)} (${[...held].join(', ')})`)
}

async function main() {
  const schema = judgeSchema(readMigrations())
  if (!schema.built || schema.faults.length) {
    for (const f of schema.faults) console.error(`${TAG} FAIL (A, schema): ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} A, schema: public.${TABLE} created in ${schema.where}; ${HASH} not null and unique on its own (${schema.holds} rule(s) standing); a near copy refused within ${schema.bits} bit(s)`)

  const render = judgeRenderPaths(sourceFiles('.').map((path) => ({ path, ...readSource(path) })))
  if (render.faults.length) {
    for (const f of render.faults) console.error(`${TAG} FAIL (C, render paths): ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} C, render paths: photos read only through ${READER}; ${render.readers} file(s) pass their rows through withVenuePhotos; no public page reads the venue library`)

  const video = judgeVideoSchema(readMigrations())
  if (video.faults.length) {
    for (const f of video.faults) console.error(`${TAG} FAIL (D, videos): ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} D, videos: ${video.trigger} refuses a link already on another event`)

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
    for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  if (!/^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/.test(url)) {
    console.log(`${TAG} B, rows: NOT JUDGED, no real Supabase project URL in the environment (${url.length} characters); clauses A, C and D passed`)
    return
  }
  const credential = tableReadCredential(process.env)
  if (!credential.key) {
    console.log(`${TAG} B, rows: NOT JUDGED [no-credential]: ${credential.reason}. No assignment was read; clauses A, C and D passed`)
    return
  }
  const rows = []
  for (let from = 0; ; from += 1000) {
    const query = `${TABLE}?select=${HASH},${DHASH}::text,${EVENT},${SERIES}&order=${HASH}.asc&offset=${from}&limit=1000`
    const outcome = await selectRest({ url, key: credential.key, query })
    if (!outcome.ok) {
      console.error(`${TAG} FAIL (B, rows): ${couldNotLook(TABLE, outcome)}`)
      process.exitCode = 1
      return
    }
    rows.push(...outcome.value)
    if (outcome.value.length < 1000) break
  }
  const { twice, near, unhashed } = judgeAssignments(rows, schema.bits)
  const linked = []
  for (let from = 0; ; from += 1000) {
    const query = `events?select=id,video_url,listing_series_id&video_url=not.is.null&order=id.asc&offset=${from}&limit=1000`
    const outcome = await selectRest({ url, key: credential.key, query })
    if (!outcome.ok) {
      console.error(`${TAG} FAIL (D, videos): ${couldNotLook('events.video_url', outcome)}`)
      process.exitCode = 1
      return
    }
    linked.push(...outcome.value)
    if (outcome.value.length < 1000) break
  }
  const videos = judgeVideos(linked)
  declareWork('one-photo-one-event', {
    did: { 'photo assignment read': rows.length, 'event with a video link read': linked.length },
    found: { 'photo assigned twice': twice.length, 'near copy on two events': near.length, 'assignment with no difference hash': unhashed, 'video on two events': videos.length },
    zeroIsFine: {
      'photo assignment read': 'a database with no assignment yet shows only typographic covers, which P1 allows',
      'event with a video link read': 'a video is optional on an event',
    },
  })
  for (const f of [...twice, ...near]) console.error(`${TAG} FAIL (B, rows): ${f}`)
  for (const f of videos) console.error(`${TAG} FAIL (D, videos): ${f}`)
  if (twice.length || near.length || videos.length) {
    process.exitCode = 1
    return
  }
  const said = unhashed ? `; ${unhashed} with no difference hash, judged by their bytes alone` : ''
  console.log(`${TAG} PASS: ${rows.length} photo assignment(s) on ${url.replace(/^https:\/\/([a-z0-9]+)\..*$/, '$1')}, no hash twice, no two events within ${schema.bits} bit(s)${said}; ${linked.length} video link(s), none on two events`)
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/guards/one-photo-one-event.mjs')) await main()
