/**
 * FINGERPRINT THE VENUE PHOTOS ALREADY APPROVED OR WAITING, AND DEAL THEM (no photo is ever reused: Lawal's ruling of
 * 31 October 2026, 00:14; the project manager's 00:22 (2)). The approval screen fingerprints each photo as it approves
 * it; the rows approved before that screen shipped, and the ones waiting, have none, and a photo without one is never
 * dealt to a night (deal_venue_photos).
 *
 * WHAT IT DOES: reads every linked venue photo without a fingerprint (approved or pending), read only, through the
 * Management API; fetches each file, naming itself to Wikimedia; computes the SHA-256 and the difference hash with the
 * same code the screen uses (src/lib/images/photo-hash.ts); and WRITES A SQL FILE, never the database: one
 * venue_image_fingerprint call a photo, then one deal_venue_photos, then a read back. That file is applied by window
 * 4's logged path (dry run, APPLY), so production is written only there. A file that cannot be read is listed, not
 * guessed.
 *
 * Usage, from the repository root in PowerShell (the token comes from the environment and is never printed):
 *   scripts\ops\with-supabase-token.ps1 npx tsx scripts/ops/venue-photo-fingerprints.ts --target test <out.sql>
 *   scripts\ops\with-supabase-token.ps1 npx tsx scripts/ops/venue-photo-fingerprints.ts --target production <out.sql>
 */
import { writeFileSync } from 'node:fs'
import { photoHashes } from '../../src/lib/images/photo-hash'

const REFS = { test: 'vkapkibzokmfaxqogypq', production: 'gndnldyfudbytbboxesk' } as const
const USER_AGENT = 'EventLinqs venue photos (https://www.eventlinqs.com.au; hello@eventlinqs.com)'

function argsOf(argv: string[]): { ref: string; target: string; out: string } {
  const at = argv.indexOf('--target')
  const target = at >= 0 ? argv[at + 1] : ''
  const out = argv.filter((a, i) => !a.startsWith('--') && i !== at + 1)[0]
  if ((target !== 'test' && target !== 'production') || !out) {
    throw new Error('usage: venue-photo-fingerprints.ts --target test|production <out.sql>')
  }
  return { ref: REFS[target], target, out }
}

async function readOnly(ref: string, query: string): Promise<unknown[]> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set: run through scripts/ops/with-supabase-token.ps1')
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`the read was refused (HTTP ${res.status}): ${text.slice(0, 300)}`)
  return JSON.parse(text) as unknown[]
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`

function main(): Promise<number> {
  return (async () => {
    const { ref, target, out } = argsOf(process.argv.slice(2))
    const rows = (await readOnly(
      ref,
      `select id, image_url, approval_state from public.venue_images
        where venue_id is not null and photo_sha256 is null and approval_state in ('approved', 'pending')
        order by approval_state, id`,
    )) as { id: string; image_url: string; approval_state: string }[]
    console.log(`target ${target} (${ref}): ${rows.length} linked photo(s) without a fingerprint, read only`)

    const lines: string[] = [
      `-- venue photo fingerprints for ${target} (${ref}), written ${new Date().toISOString()} by scripts/ops/venue-photo-fingerprints.ts`,
      '-- Each line fingerprints one photo from the bytes read at that time; then one deal; then the read back.',
    ]
    const unread: string[] = []
    for (const row of rows) {
      try {
        const res = await fetch(row.image_url, { headers: { 'User-Agent': USER_AGENT } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { sha256, dhash } = await photoHashes(Buffer.from(await res.arrayBuffer()))
        lines.push(`select public.venue_image_fingerprint(${quote(row.id)}::uuid, ${quote(sha256)}, ${dhash}::bigint); -- ${row.approval_state}`)
      } catch (error) {
        unread.push(`${row.id} ${row.image_url}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    lines.push('select public.deal_venue_photos() as dealt;')
    lines.push(
      'select count(*) as assignments, count(distinct photo_sha256) as distinct_photos, count(distinct coalesce(event_id::text, listing_series_id::text)) as nights_or_series from public.photo_assignments where retired_at is null;',
    )
    writeFileSync(out, `${lines.join('\n')}\n`)
    console.log(`WROTE ${out}: ${rows.length - unread.length} fingerprint(s), then the deal and the read back`)
    for (const u of unread) console.log(`UNREAD ${u}`)
    return unread.length === 0 ? 0 : 2
  })()
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
