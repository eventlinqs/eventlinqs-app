// Batch 10 - Apply imagery manifest to the events table.
//
// Reads docs/IMAGERY-MANIFEST.md, parses the table, and for each row
// where the founder has filled in COVER URL + THUMB URL:
//   1. updates events.cover_image_url + events.thumbnail_url
//   2. if STATUS AFTER is 'published', promotes events.status to 'published'
//
// Idempotent: re-running with the same manifest is a no-op for rows
// already updated. Dry-run mode prints what would happen without
// touching the DB - run with `--dry-run` to verify.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-event-covers.mjs
//   node --env-file=.env.local scripts/backfill-event-covers.mjs --dry-run
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.local scripts/backfill-event-covers.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const md = readFileSync('docs/IMAGERY-MANIFEST.md', 'utf-8')

/**
 * Parse the manifest's markdown table. Returns rows of the shape:
 *   { slug, status, statusAfter, coverUrl, thumbUrl }
 *
 * The header row is detected by the column names; the first data row
 * sits below the markdown alignment row (`|---|---|...`).
 */
function parseManifest(input) {
  const lines = input.split(/\r?\n/)
  let inTable = false
  let columns = null
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) {
      inTable = false
      continue
    }
    const cells = trimmed.split('|').slice(1, -1).map(s => s.trim())
    if (!columns) {
      // Expect first table line to be the header. Heuristic: it must
      // include 'Slug' and 'Cover URL' and 'Status After' columns.
      const lower = cells.map(c => c.toLowerCase())
      if (lower.includes('slug') && lower.some(c => c.includes('cover')) && lower.some(c => c.includes('status after'))) {
        columns = lower
        inTable = true
        continue
      }
      continue
    }
    if (cells.every(c => /^[-:]+$/.test(c))) continue // alignment row
    if (!inTable) continue
    const row = {}
    columns.forEach((col, i) => { row[col] = cells[i] ?? '' })
    out.push({
      slug: row['slug'] ?? '',
      status: row['status'] ?? '',
      statusAfter: (row['status after'] ?? '').toLowerCase(),
      coverUrl: row['cover url'] ?? '',
      thumbUrl: row['thumb url'] ?? '',
    })
  }
  return out
}

const rows = parseManifest(md)
console.log(`Parsed ${rows.length} manifest rows. Dry-run: ${DRY_RUN}`)

let updated = 0
let promoted = 0
let skipped = 0
let failed = 0

for (const row of rows) {
  if (!row.slug) continue
  if (!row.coverUrl || !row.thumbUrl) {
    console.log(`SKIP ${row.slug}: cover/thumb URLs not filled in`)
    skipped++
    continue
  }

  if (DRY_RUN) {
    console.log(`DRY ${row.slug}: would set cover_image_url + thumbnail_url${row.statusAfter === 'published' ? ' + promote to published' : ''}`)
    updated++
    if (row.statusAfter === 'published') promoted++
    continue
  }

  const update = {
    cover_image_url: row.coverUrl,
    thumbnail_url: row.thumbUrl,
  }
  if (row.statusAfter === 'published') {
    update.status = 'published'
  }

  const { error } = await supabase
    .from('events')
    .update(update)
    .eq('slug', row.slug)

  if (error) {
    failed++
    console.error(`FAIL ${row.slug}: ${error.message}`)
    continue
  }

  updated++
  if (row.statusAfter === 'published') promoted++
  console.log(`OK ${row.slug}${row.statusAfter === 'published' ? ' (promoted)' : ''}`)
}

console.log(`\nBackfill complete:`)
console.log(`  Updated: ${updated}`)
console.log(`  Promoted to published: ${promoted}`)
console.log(`  Skipped (manifest incomplete): ${skipped}`)
console.log(`  Failed: ${failed}`)

if (failed > 0) process.exit(1)
