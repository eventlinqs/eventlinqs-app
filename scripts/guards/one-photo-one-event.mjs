/**
 * GUARD: ONE PHOTO, ONE EVENT (the photo system, P1 and P2, binding from
 * Lawal's ruling of 31 October 2026 00:14: "Every photo is unique to a
 * particular event." C:\dev\START-16OCT\EVENTLINQS-PHOTO-SYSTEM-31OCT.md).
 *
 * WHY. On 31 October Lawal saw the same photo on different cards in different
 * sections of the live site. The card chain picked a photo at render time, so
 * nothing anywhere could say a photo was already somebody else's. The photo
 * system moves that decision into one record per photo, and this guard is the
 * gate's half of its proof (proof 1 in the document): it fails any car in which
 * a photo can be, or is, assigned to two events.
 *
 * WHAT IT JUDGES, two clauses, each printed on every run:
 *
 *   A. THE SCHEMA (P2, read from supabase/migrations, no network). Some
 *      migration creates public.photo_assignments; photo_sha256 is NOT NULL and
 *      UNIQUE on its own (a column constraint, a table constraint, a later
 *      ADD CONSTRAINT or a CREATE UNIQUE INDEX on that one column), so a second
 *      assignment of the same bytes is refused by the database, not by
 *      convention; photo_phash exists; event_id is NOT NULL. A migration that
 *      later drops that constraint or index undoes it and fails here too.
 *
 *   B. THE ROWS (P1, read through the shared door, read only). Every row of
 *      photo_assignments on the database the environment names. No sha256
 *      twice (the index makes this impossible; it is read anyway, because an
 *      index can be dropped by hand), and no two rows for DIFFERENT events
 *      whose perceptual hashes are within NEAR_DUPLICATE_BITS of each other,
 *      which is how a resized or cropped copy of one photo shows itself.
 *
 * NOT BUILT IS A FAILURE. Until a migration creates the table, clause A fails
 * and says so. That is the truth about the platform on the day this was
 * written, which is why the guard is registered in run-guards.mjs in the same
 * car as the assignment table, and run by C:\dev\STACK-CHECK.sh before that.
 *
 * NOT JUDGED HERE, said so that nobody reads a PASS as more than it is: that a
 * render path reads the assignment rather than picking a photo (clause C, added
 * with the reader module), and the live crawl (proof 2), which is window 6's
 * script and reads production pages.
 *
 * The names below are the contract window 1 wrote on 31 October 00:16 for
 * window 3's assignment build; if that build names them differently, they
 * change here, in one place.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { selectRest, couldNotLook } from './lib/db-read.mjs'
import { tableReadCredential } from './lib/table-read-credential.mjs'

const TAG = '[one-photo-one-event]'

export const TABLE = 'photo_assignments'
export const HASH = 'photo_sha256'
export const PHASH = 'photo_phash'
export const EVENT = 'event_id'
export const MIGRATIONS = 'supabase/migrations'

/*
 * 64-bit perceptual hashes (16 hex characters). Two photos within 8 bits are
 * the same photo for P1. 8 of 64 is the usual pHash line between "a resize, a
 * crop or a recompression" and "a different photograph"; window 3's writer
 * must refuse at the same number, so it is exported, not repeated.
 */
export const NEAR_DUPLICATE_BITS = 8

const SQL_COMMENT = /--[^\n]*|\/\*[\s\S]*?\*\//g

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
 * Clause A. Returns { built, faults: string[], where } from the migrations.
 * @param {{ file: string, sql: string }[]} migrations
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
  const phash = column(PHASH)
  const event = column(EVENT)
  if (!hash) faults.push(`${made.file}: public.${TABLE} has no ${HASH} column`)
  else if (!/\bnot\s+null\b|\bprimary\s+key\b/.test(hash)) faults.push(`${made.file}: ${HASH} may be null, and a null hash is never equal to another, so the unique rule would not hold for it`)
  if (!phash) faults.push(`${made.file}: public.${TABLE} has no ${PHASH} column, so a resized or cropped copy cannot be found`)
  if (!event) faults.push(`${made.file}: public.${TABLE} has no ${EVENT} column`)
  else if (!/\bnot\s+null\b/.test(event)) faults.push(`${made.file}: ${EVENT} may be null, so a photo could be held by no event and given to one later without a record`)

  /* Uniqueness on the hash ALONE: (photo_sha256, event_id) would allow the same photo on two events. */
  const alone = new RegExp(`unique\\s*(?:nulls\\s+not\\s+distinct\\s*)?\\(\\s*"?${HASH}"?\\s*\\)|primary\\s+key\\s*\\(\\s*"?${HASH}"?\\s*\\)`)
  const indexAlone = new RegExp(
    `create\\s+unique\\s+index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?("?[a-z0-9_]+"?)\\s+on\\s+(?:only\\s+)?(?:public\\.)?${TABLE}\\s*(?:using\\s+btree\\s*)?\\(\\s*"?${HASH}"?\\s*\\)`,
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
    for (const x of m.sql.matchAll(indexAlone)) holds.push({ file: m.file, name: x[1].replace(/"/g, '') })
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
  return { built: true, faults, where: made.file, holds: live.length }
}

/** Bits that differ between two hex perceptual hashes; null when either is not one. */
export function hammingHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]+$/i.test(a + b)) return null
  let bits = 0
  for (let i = 0; i < a.length; i += 8) {
    let x = (parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16)) >>> 0
    while (x) {
      bits += x & 1
      x >>>= 1
    }
  }
  return bits
}

/**
 * Clause B. Rows are { photo_sha256, photo_phash, event_id }.
 * @returns {{ twice: string[], near: string[], unreadable: number }}
 */
export function judgeAssignments(rows, threshold = NEAR_DUPLICATE_BITS) {
  const twice = []
  const near = []
  let unreadable = 0
  const byHash = new Map()
  for (const r of rows) {
    const seen = byHash.get(r[HASH])
    if (seen !== undefined) twice.push(`${HASH} ${String(r[HASH]).slice(0, 12)} is assigned twice (events ${seen} and ${r[EVENT]})`)
    else byHash.set(r[HASH], r[EVENT])
  }
  const hashed = rows.filter((r) => {
    const ok = typeof r[PHASH] === 'string' && /^[0-9a-f]{16}$/i.test(r[PHASH])
    if (!ok) unreadable++
    return ok
  })
  for (let i = 0; i < hashed.length; i++) {
    for (let j = i + 1; j < hashed.length; j++) {
      const a = hashed[i]
      const b = hashed[j]
      if (a[EVENT] === b[EVENT]) continue
      const d = hammingHex(a[PHASH], b[PHASH])
      if (d !== null && d <= threshold) near.push(`one photo on two events: ${PHASH} ${a[PHASH]} (event ${a[EVENT]}) and ${b[PHASH]} (event ${b[EVENT]}) differ by ${d} bit(s), within ${threshold}`)
    }
  }
  return { twice, near, unreadable }
}

async function main() {
  const schema = judgeSchema(readMigrations())
  if (!schema.built || schema.faults.length) {
    for (const f of schema.faults) console.error(`${TAG} FAIL (A, schema): ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`${TAG} A, schema: public.${TABLE} created in ${schema.where}; ${HASH} not null and unique on its own (${schema.holds} rule(s) standing), ${PHASH} present, ${EVENT} not null`)

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
    for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  if (!/^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/.test(url)) {
    console.log(`${TAG} B, rows: NOT JUDGED, no real Supabase project URL in the environment (${url.length} characters); clause A alone passed`)
    return
  }
  const credential = tableReadCredential(process.env)
  if (!credential.key) {
    console.log(`${TAG} B, rows: NOT JUDGED [no-credential]: ${credential.reason}. No assignment was read; clause A alone passed`)
    return
  }
  const rows = []
  for (let from = 0; ; from += 1000) {
    const query = `${TABLE}?select=${HASH},${PHASH},${EVENT}&order=${HASH}.asc&offset=${from}&limit=1000`
    const outcome = await selectRest({ url, key: credential.key, query })
    if (!outcome.ok) {
      console.error(`${TAG} FAIL (B, rows): ${couldNotLook(TABLE, outcome)}`)
      process.exitCode = 1
      return
    }
    rows.push(...outcome.value)
    if (outcome.value.length < 1000) break
  }
  const { twice, near, unreadable } = judgeAssignments(rows)
  declareWork('one-photo-one-event', {
    did: { 'photo assignment read': rows.length },
    found: { 'photo assigned twice': twice.length, 'near duplicate on two events': near.length, 'unreadable perceptual hash': unreadable },
    zeroIsFine: { 'photo assignment read': 'a database with no assignment yet shows only typographic covers, which P1 allows' },
  })
  for (const f of [...twice, ...near]) console.error(`${TAG} FAIL (B, rows): ${f}`)
  if (unreadable) console.error(`${TAG} FAIL (B, rows): ${unreadable} assignment(s) carry no 16-hex ${PHASH}, so a copy of them could not be found`)
  if (twice.length || near.length || unreadable) {
    process.exitCode = 1
    return
  }
  console.log(`${TAG} PASS: ${rows.length} photo assignment(s) on ${url.replace(/^https:\/\/([a-z0-9]+)\..*$/, '$1')}, no hash twice, no two events within ${NEAR_DUPLICATE_BITS} bits`)
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/guards/one-photo-one-event.mjs')) await main()
