// Batch 10 - Imagery Manifest Generator
//
// Queries the events table for every row whose cover_image_url points
// at picsum.photos and emits a markdown table the founder can fill in
// during the imagery backfill programme. Idempotent: re-running
// regenerates the manifest with the current DB state. Existing fill-in
// in the manifest is NOT preserved across regenerations - run this
// before backfill, fill it in once, then run the apply script.
//
// Usage: node --env-file=.env.local scripts/generate-imagery-manifest.mjs
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.local scripts/generate-imagery-manifest.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase
  .from('events')
  .select('slug, title, status, visibility, venue_city, cover_image_url')
  .ilike('cover_image_url', 'https://picsum.photos/%')
  .order('venue_city', { ascending: true, nullsFirst: false })
  .order('slug', { ascending: true })

if (error) {
  console.error('query failed:', error.message)
  process.exit(1)
}

const rows = data ?? []
const cityCount = new Set(rows.map(r => r.venue_city).filter(Boolean)).size

const header = `# EventLinqs Imagery Manifest - Pre-launch Cover Backfill

Generated: ${new Date().toISOString().slice(0, 10)}
Picsum events found: ${rows.length}
Unique cities: ${cityCount}

This manifest tracks every event whose cover image needs replacement
before public launch. The 14 (or however many) events currently in
status='draft' get auto-promoted to status='published' once their
covers are filled in - the apply script handles both columns
atomically.

## Founder workflow

1. Source each cover image from the Stocksy bundle or Adobe Stock
   free credits per docs/IMAGERY-STRATEGY.md.
2. Upload to Supabase Storage at
   \`event-images/{slug}/cover-1200.jpg\` and
   \`event-images/{slug}/thumb-600.jpg\` (the apply script reads both
   columns).
3. Fill in the COVER URL and THUMB URL columns below with the public
   URLs (use the branded URL pattern when available, e.g.
   \`https://images.eventlinqs.com/event-images/{slug}/cover-1200.jpg\`).
4. From PowerShell:
   \`\`\`powershell
   node --env-file=.env.local scripts/backfill-event-covers.mjs
   \`\`\`
5. The script reads this manifest, applies the URL updates, promotes
   draft events whose status_after column is "published", and reports
   any rows still needing fill-in.
6. After the apply reports \`Skipped: 0\`, founder runs the constraint
   validation migration:
   \`\`\`powershell
   npx supabase db push --linked
   \`\`\`
   which applies \`20260509000010_validate_real_cover_constraint.sql\`
   and locks the no-picsum gate permanently.

## Manifest

The columns \`Cover URL\` and \`Thumb URL\` are blank-by-default; founder
fills them in. \`Status After\` is \`published\` for draft events that
should be promoted on apply, and \`unchanged\` for already-published
events that just need the URL swap.

| # | Slug | Status | Visibility | City | Title | Cover URL | Thumb URL | Status After |
|---|------|--------|------------|------|-------|-----------|-----------|--------------|
`

const lines = rows.map((r, i) => {
  const status = r.status ?? 'unknown'
  const statusAfter = status === 'draft' ? 'published' : 'unchanged'
  const safeTitle = (r.title ?? '').replace(/\|/g, '\\|').slice(0, 60)
  return `| ${i + 1} | ${r.slug ?? ''} | ${status} | ${r.visibility ?? ''} | ${r.venue_city ?? ''} | ${safeTitle} | | | ${statusAfter} |`
})

const out = header + lines.join('\n') + '\n'

writeFileSync('docs/IMAGERY-MANIFEST.md', out, 'utf-8')

console.log(`Wrote docs/IMAGERY-MANIFEST.md`)
console.log(`  picsum events: ${rows.length}`)
console.log(`  unique cities: ${cityCount}`)
console.log(`  drafts to promote: ${rows.filter(r => r.status === 'draft').length}`)
