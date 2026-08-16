#!/usr/bin/env node
/**
 * BACKFILL: give every cover-less event a designed cover.
 *
 * WHAT IT DOES. Counts the events with no real cover, and with --apply renders
 * the Law 6 typographic composition for each one through the SAME code path the
 * Launch Kit uses (src/lib/events/generated-cover.ts, which calls
 * renderSocialCard at the 'cover' format), stores it in the event-images bucket
 * under generated-covers/, and points events.cover_image_url at it.
 *
 * WHAT IT NEVER DOES. It never touches an event that already has a real cover.
 * An organiser's own artwork outranks ours, always, and --force only re-mints a
 * cover this script previously generated.
 *
 * Run (TEST only, and the preflight enforces that rather than trusting it):
 *
 *   npx tsx scripts/backfill-generated-covers.mts                 # count only
 *   npx tsx scripts/backfill-generated-covers.mts --apply         # write
 *   npx tsx scripts/backfill-generated-covers.mts --apply --limit 5
 *
 * IT PRINTS ROW COUNTS BEFORE AND AFTER, from the same query, and a per-event
 * outcome line. A backfill that says "done" without saying how many rows it
 * moved is the shape this project keeps finding: the thing that reports the
 * outcome is not the thing that does the work.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { assertNotProduction } = require('./lib/production-write-preflight.mjs')

// FIRST EXECUTABLE STATEMENT. This script reads .env.test explicitly, so the
// preflight is told to judge that same file rather than the repo default.
assertNotProduction({ envFile: '.env.test' })

// Load .env.test into process.env before anything imports a Supabase client,
// because createAdminClient reads the environment at module scope.
for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (!match) continue
  const value = match[2].trim().replace(/^["']|["']$/g, '')
  if (value) process.env[match[1]] = value
}
process.env.NEXT_PUBLIC_SITE_URL ??= 'https://eventlinqs.com'

const { createClient } = await import('@supabase/supabase-js')
const { attachGeneratedCover, renderGeneratedCover } = await import(
  '../src/lib/events/generated-cover'
)
const { hasRealCover } = await import('../src/lib/events/publish-gate')

const apply = process.argv.includes('--apply')
const force = process.argv.includes('--force')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg === -1 ? Number.POSITIVE_INFINITY : Number(process.argv[limitArg + 1])
// --out <eventId> <file>: render ONE cover to disk and write nothing anywhere
// else. A rendered artefact is unproven until somebody opens it and looks at
// it, and that has to be possible without a database write.
const outArg = process.argv.indexOf('--out')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type Row = {
  id: string
  title: string
  status: string
  visibility: string
  cover_image_url: string | null
}

async function census(): Promise<{ total: number; coverless: Row[]; byStatus: Map<string, number> }> {
  const rows: Row[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('events')
      .select('id, title, status, visibility, cover_image_url')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`census query failed: ${error.message}`)
    const page = (data ?? []) as Row[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  const coverless = rows.filter(r => !hasRealCover(r.cover_image_url))
  const byStatus = new Map<string, number>()
  for (const r of coverless) {
    const key = `${r.status}/${r.visibility}`
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1)
  }
  return { total: rows.length, coverless, byStatus }
}

if (outArg !== -1) {
  const eventId = process.argv[outArg + 1]
  const file = process.argv[outArg + 2]
  const bytes = await renderGeneratedCover(eventId)
  if (!bytes) {
    console.error(`[covers] no such event: ${eventId}`)
    process.exitCode = 1
  } else {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, Buffer.from(bytes))
    console.log(`[covers] rendered ${(bytes.byteLength / 1024).toFixed(0)} KB to ${file}`)
  }
} else {

const before = await census()

console.log(`[covers] project ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
console.log(`[covers] BEFORE: ${before.total} event(s), ${before.coverless.length} with no real cover.`)
for (const [key, count] of [...before.byStatus].sort((a, b) => b[1] - a[1])) {
  console.log(`[covers]   ${count.toString().padStart(4)}  ${key}`)
}

if (before.coverless.length === 0) {
  console.log('[covers] nothing to do.')
} else if (!apply) {
  console.log('[covers] DRY RUN. Re-run with --apply to render and attach. First few:')
  for (const r of before.coverless.slice(0, 10)) {
    console.log(`[covers]   ${r.id}  ${r.status}/${r.visibility}  ${r.title}`)
  }
} else {
  let done = 0
  let failed = 0
  const targets = before.coverless.slice(0, Number.isFinite(limit) ? limit : undefined)
  console.log(`[covers] APPLYING to ${targets.length} of ${before.coverless.length} event(s).`)

  for (const row of targets) {
    const result = await attachGeneratedCover(row.id, { force })
    if (result.ok && result.regenerated) {
      done += 1
      console.log(`[covers]   OK    ${row.id}  ${(result.bytes / 1024).toFixed(0)} KB  ${row.title}`)
    } else if (result.ok) {
      console.log(`[covers]   SKIP  ${row.id}  already has a real cover  ${row.title}`)
    } else {
      failed += 1
      console.log(`[covers]   FAIL  ${row.id}  ${result.reason} ${result.detail ?? ''}  ${row.title}`)
    }
  }

  const after = await census()
  console.log(`[covers] AFTER: ${after.total} event(s), ${after.coverless.length} with no real cover.`)
  console.log(
    `[covers] rendered ${done}, failed ${failed}, moved ${before.coverless.length - after.coverless.length} row(s).`,
  )
  if (failed > 0) process.exitCode = 1
}
}
